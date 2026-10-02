export type HomeFeature = {
  type: "POST" | "WRITEUP";
  title: string;
  description: string;
  href: string;
  date: Date;
  category: string;
};

const encodePath = (value: string) =>
  value.split("/").map(encodeURIComponent).join("/");

export const homePostPageUrl = (file: string) =>
  `/generated/posts/${encodePath(file.replace(/\.md$/i, ".html"))}`;

export const homeWriteupPageUrl = (ctfId: string, file: string) =>
  `/generated/writeups/${encodeURIComponent(ctfId)}/${encodeURIComponent(file.replace(/\.md$/i, ".html"))}`;

const newestFirst = (left: HomeFeature, right: HomeFeature) =>
  right.date.getTime() - left.date.getTime();

export function selectHomepageProjection(posts: HomeFeature[], writeups: HomeFeature[]) {
  const latestPost = [...posts].sort(newestFirst)[0] ?? null;
  const latestWriteup = [...writeups].sort(newestFirst)[0] ?? null;
  return {
    latestPost,
    latestWriteup,
    featured: latestWriteup ?? latestPost,
  };
}