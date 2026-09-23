const fs = require("fs");
const vm = require("vm");
const src = fs.readFileSync("/home/user/vicambachgiai-src/vicambachgiai/js/seed.js", "utf8");
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
function uid(prefix) {
  return prefix + "_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
}
async function hashPassword() {
  return "unused";
}
const db = {
  users: [],
  profiles: [],
  stories: [],
  chapters: [],
  genres: [],
  tags: [],
  story_genres: [],
  story_tags: [],
  favorites: [],
  follows: [],
  reading_progress: [],
  comments: [],
  ratings: [],
  views: [],
  notifications: [],
  poll_votes: [],
  inbox: [],
  site_settings: {},
};
(async () => {
  await sandbox.window.VCBGSeed(db, { uid, hashPassword });
  const out = {
    genres: db.genres,
    tags: db.tags,
    stories: db.stories,
    story_genres: db.story_genres,
    story_tags: db.story_tags,
    chapters: db.chapters,
    comments: db.comments.map((c) => ({
      ...c,
      likes: c.likes || [],
    })),
    favorites: db.favorites,
    follows: db.follows,
    ratings: db.ratings,
    views: db.views,
    notifications: db.notifications,
    site_settings: db.site_settings,
    users: db.users.map((u, i) => ({
      email: u.email,
      role: u.role,
      display_name: db.profiles[i].display_name,
      bio: db.profiles[i].bio,
      avatar: db.profiles[i].avatar,
      password: u.email.startsWith("admin") ? "Admin123!" : "Docgia123!",
      old_id: u.id,
    })),
  };
  fs.writeFileSync("/home/user/Vicambachgiai3/scripts/catalog.json", JSON.stringify(out));
  console.log("stories", out.stories.length, "chapters", out.chapters.length, "bytes", JSON.stringify(out).length);
})();
