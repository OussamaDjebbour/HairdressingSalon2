import ReactDOM from 'react-dom/client';
import App from './App';
import { startApp } from './bootstrap';
import { installChunkReload } from './lib/chunkReload';
import './index.css';

installChunkReload();
void startApp(ReactDOM.createRoot(document.getElementById('root')!), window.location, App);
