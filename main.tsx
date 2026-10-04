import {createRoot} from 'react-dom/client';
import Studio from './app/studio';
import './app/globals.css';
import './app/surfaces.css';
import './app/connection.css';
createRoot(document.getElementById('root')!).render(<Studio/>);
