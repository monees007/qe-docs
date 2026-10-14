import { createRouter, createWebHistory, type RouterScrollBehavior } from 'vue-router';
import HomeView from './views/HomeView.vue';

const scrollBehavior: RouterScrollBehavior = (to, from, saved) => {
  if (saved) return saved;
  // in-document anchors are handled by the views once their content is rendered
  if (to.hash) return false;
  if (to.path === from.path) return false;
  return { top: 0 };
};

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior,
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { title: 'Home' } },
    { path: '/input/:id', name: 'input', component: () => import('./views/InputView.vue') },
    { path: '/guide/:id/:chapter?', name: 'guide', component: () => import('./views/GuideView.vue') },
    { path: '/release-notes', name: 'notes', component: () => import('./views/NotesView.vue'), meta: { title: 'Release notes' } },
    { path: '/pdf/:id', name: 'pdf', component: () => import('./views/PdfView.vue') },
    { path: '/graph/:id?', name: 'graph', component: () => import('./views/GraphView.vue'), meta: { title: 'Cross-reference graph' } },
    { path: '/variables', name: 'variables', component: () => import('./views/IndexView.vue'), meta: { title: 'Variable index' } },
    { path: '/search', name: 'search', component: () => import('./views/SearchView.vue'), meta: { title: 'Search' } },
    { path: '/about', name: 'about', component: () => import('./views/AboutView.vue'), meta: { title: 'About' } },
    { path: '/:pathMatch(.*)*', name: 'notfound', component: () => import('./views/NotFoundView.vue'), meta: { title: 'Not found' } },
  ],
});

router.afterEach((to) => {
  const t = to.meta.title as string | undefined;
  if (t) document.title = `${t} · QE Docs Reader`;
});
