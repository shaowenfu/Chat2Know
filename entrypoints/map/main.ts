import { createApp } from 'vue';
import App from './App.vue';
import { initI18n } from '@/src/i18n';
import './style.css';

// A language change from settings or the first screen reloads the page in the new language.
void initI18n(() => location.reload()).then(() => createApp(App).mount('#app'));
