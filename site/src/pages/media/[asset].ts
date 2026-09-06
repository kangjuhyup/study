import { loadBlog } from '../../lib/blog.mjs';

export async function getStaticPaths() {
  const { images } = await loadBlog();
  return [...images].map(([asset, image]) => ({ params: { asset }, props: { image } }));
}

export function GET({ props }) {
  return new Response(new Uint8Array(props.image.bytes), { headers: { 'Content-Type': props.image.contentType } });
}
