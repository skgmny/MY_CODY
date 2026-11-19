export default defineNuxtConfig({
  ssr: false,
  vite: { optimizeDeps: { include: ['@huggingface/transformers', 'onnxruntime-web/wasm'] } },
  css: ['~/assets/main.css'],
  app: {
    head: {
      title: '오늘의 옷장',
      htmlAttrs: { lang: 'ko' },
      meta: [
        { name: 'description', content: '내 옷으로 만드는 오늘의 코디' },
        { name: 'theme-color', content: '#fffaf7' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', href: '/icon-192.png' },
        { rel: 'apple-touch-icon', href: '/icon-192.png' },
      ],
    },
  },
})
