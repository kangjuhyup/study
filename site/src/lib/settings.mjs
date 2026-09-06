export const site = {
  title: 'Study',
  author: 'kangjuhyup',
  description: '직접 실험하고, 원인을 찾고, 이해한 내용을 기록합니다.',
  origin: 'https://kangjuhyup.github.io',
  base: '/study/',
};

export const pagePath = (slug = '') => `${site.base}${slug}`;
export const absoluteURL = (path = site.base) => new URL(path, site.origin).href;
export const isPreview = () => process.env.BLOG_PREVIEW === '1';
