let cachedAuth = null;

const AUTH_URL = "https://api.backblazeb2.com/b2api/v4/b2_authorize_account";

async function secretValue(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value.get === "function") {
    const resolved = await value.get();
    return String(resolved || "").trim();
  }
  return "";
}

async function config(env) {
  const [keyId, applicationKey] = await Promise.all([
    secretValue(env && env.B2_KEY_ID),
    secretValue(env && env.B2_APPLICATION_KEY),
  ]);
  if (!keyId || !applicationKey) {
    const error = new Error("B2_NOT_CONFIGURED");
    error.code = "B2_NOT_CONFIGURED";
    throw error;
  }
  return { keyId, applicationKey };
}

function storageApi(auth) {
  return (auth.apiInfo && auth.apiInfo.storageApi) || auth;
}

function allowed(auth) {
  const storage = storageApi(auth);
  return storage.allowed || auth.allowed || {};
}

function bucketName(env, auth) {
  return String(env.B2_BUCKET_NAME || allowed(auth).bucketName || "").trim();
}

function bucketId(env, auth) {
  return String(env.B2_BUCKET_ID || allowed(auth).bucketId || "").trim();
}

function encodedPath(path) {
  return String(path || "")
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function hex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function errorMessage(response) {
  try {
    const data = await response.clone().json();
    return String(data.message || data.code || "");
  } catch (_) {
    return "";
  }
}

export async function authorizeB2(env, force = false) {
  const { keyId, applicationKey } = await config(env);
  if (!force && cachedAuth && cachedAuth.keyId === keyId && cachedAuth.expiresAt > Date.now()) {
    return cachedAuth.value;
  }

  const response = await fetch(AUTH_URL, {
    headers: { Authorization: "Basic " + btoa(keyId + ":" + applicationKey) },
  });
  if (!response.ok) {
    const error = new Error((await errorMessage(response)) || "B2_AUTH_FAILED");
    error.code = "B2_AUTH_FAILED";
    throw error;
  }

  const value = await response.json();
  cachedAuth = {
    keyId,
    value,
    expiresAt: Date.now() + 20 * 60 * 60 * 1000,
  };
  return value;
}

async function getUploadTarget(env, auth) {
  const storage = storageApi(auth);
  const id = bucketId(env, auth);
  if (!storage.apiUrl || !id) {
    const error = new Error("B2_BUCKET_NOT_ALLOWED");
    error.code = "B2_BUCKET_NOT_ALLOWED";
    throw error;
  }

  const response = await fetch(storage.apiUrl + "/b2api/v4/b2_get_upload_url", {
    method: "POST",
    headers: {
      Authorization: auth.authorizationToken,
      "content-type": "application/json",
    },
    body: JSON.stringify({ bucketId: id }),
  });
  if (!response.ok) {
    const error = new Error((await errorMessage(response)) || "B2_UPLOAD_URL_FAILED");
    error.code = "B2_UPLOAD_URL_FAILED";
    throw error;
  }
  return response.json();
}

export async function uploadB2Object(env, path, contentType, bytes) {
  let auth = await authorizeB2(env);
  const checksum = hex(await crypto.subtle.digest("SHA-1", bytes));
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const target = await getUploadTarget(env, auth);
      const response = await fetch(target.uploadUrl, {
        method: "POST",
        headers: {
          Authorization: target.authorizationToken,
          "X-Bz-File-Name": encodedPath(path),
          "X-Bz-Content-Sha1": checksum,
          "X-Bz-Info-b2-cache-control": encodeURIComponent("public, max-age=31536000, immutable"),
          "Content-Type": contentType || "application/octet-stream",
          "Content-Length": String(bytes.byteLength),
        },
        body: bytes,
      });
      if (response.ok) return response.json();

      const message = (await errorMessage(response)) || "B2_UPLOAD_FAILED";
      lastError = new Error(message);
      if (response.status === 401 || response.status === 408 || response.status >= 500) {
        auth = await authorizeB2(env, response.status === 401);
        continue;
      }
      break;
    } catch (error) {
      lastError = error;
    }
  }

  const error = lastError || new Error("B2_UPLOAD_FAILED");
  error.code = error.code || "B2_UPLOAD_FAILED";
  throw error;
}

export async function downloadB2Object(env, path, range) {
  let auth = await authorizeB2(env);
  const storage = storageApi(auth);
  const name = bucketName(env, auth);
  if (!storage.downloadUrl || !name) {
    const error = new Error("B2_BUCKET_NOT_ALLOWED");
    error.code = "B2_BUCKET_NOT_ALLOWED";
    throw error;
  }

  const headers = { Authorization: auth.authorizationToken };
  if (range) headers.Range = range;
  let response = await fetch(
    storage.downloadUrl + "/file/" + encodeURIComponent(name) + "/" + encodedPath(path),
    { headers }
  );

  if (response.status === 401) {
    auth = await authorizeB2(env, true);
    const refreshedStorage = storageApi(auth);
    headers.Authorization = auth.authorizationToken;
    response = await fetch(
      refreshedStorage.downloadUrl + "/file/" + encodeURIComponent(bucketName(env, auth)) + "/" + encodedPath(path),
      { headers }
    );
  }
  return response;
}
