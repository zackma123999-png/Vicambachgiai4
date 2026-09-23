/* Public comment identity: show the site owner as “Quản trị viên”. */
(function () {
  if (!window.VCBG) return;

  function isAdmin(user) {
    return !!(user && (user.is_admin === true || user.role === "admin"));
  }

  function publicUser(user) {
    if (!isAdmin(user)) return user;
    return Object.assign({}, user, { display_name: "Quản trị viên" });
  }

  function labelThread(comment) {
    if (!comment) return comment;
    const staff = isAdmin(comment.user) || comment.staff === true;
    return Object.assign({}, comment, {
      user: staff ? publicUser(Object.assign({}, comment.user, { is_admin: true })) : comment.user,
      staff,
      replies: (comment.replies || []).map(labelThread),
    });
  }

  const communityFeed = VCBG.communityFeed && VCBG.communityFeed.bind(VCBG);
  if (communityFeed) {
    VCBG.communityFeed = function (options) {
      const source = communityFeed(options);
      const labeled = Array.from(source || [], labelThread);
      Object.keys(source || {}).forEach(function (key) {
        if (!/^\d+$/.test(key)) labeled[key] = source[key];
      });
      return labeled;
    };
  }

  const listComments = VCBG.listComments && VCBG.listComments.bind(VCBG);
  if (listComments) {
    VCBG.listComments = function (chapterId) {
      return (listComments(chapterId) || []).map(labelThread);
    };
  }
})();
