import './styles/app.css';
import '$lib/stores/settings';
import App from './App.svelte';
import { mount } from 'svelte';

const app = mount(App, {
  target: document.getElementById('app')!
});

export default app;
