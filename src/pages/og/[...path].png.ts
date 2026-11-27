import type { APIRoute } from "astro";
import sharp from "sharp";
import { getOrderedArticles, postOutputPath, writeupOutputPath } from "../../lib/article-data";
import { getPostPresentation, getWriteupPresentation } from "../../lib/article-metadata";
import { formatDate } from "../../lib/markdown";
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, renderOgSvg } from "../../lib/og";

type OgProps = {
  title: string;
  category: string;
  meta: string;
};

export async function getStaticPaths() {
  const { posts, writeups } = await getOrderedArticles();

  return [
    ...posts.map(({ entry }) => {
      const { title, category } = getPostPresentation(entry.data);
      return {
        params: { path: postOutputPath(entry.id).replace(/\.html$/i, "") },
        props: { title, category, meta: formatDate(entry.data.date) } satisfies OgProps,
      };
    }),
    ...writeups.map(({ ctfId, challengeFile, entry, event }) => {
      const eventTitle = event.data.title;
      const { title, category } = getWriteupPresentation(entry.data, challengeFile, eventTitle);
      return {
        params: { path: writeupOutputPath(ctfId, challengeFile).replace(/\.html$/i, "") },
        props: {
          title,
          category,
          meta: `${eventTitle} · ${formatDate(event.data.date)}`,
        } satisfies OgProps,
      };
    }),
  ];
}

export const GET: APIRoute = async ({ props }) => {
  const { title, category, meta } = props as OgProps;
  const svg = renderOgSvg({ title, category, meta });
  const png = await sharp(new TextEncoder().encode(svg)).png().toBuffer();

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-OG-Image-Size": `${OG_IMAGE_WIDTH}x${OG_IMAGE_HEIGHT}`,
    },
  });
};
