import ReactDOM from 'react-dom/client';
import App from './App';
import { startApp } from './bootstrap';
import './index.css';

void startApp(ReactDOM.createRoot(document.getElementById('root')!), window.location, App);
