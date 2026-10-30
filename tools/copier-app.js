// Copie le build web (dist/index.html, fichier unique) dans la coquille Flutter.
// Lancé par `npm run app` ; refaire après chaque changement de l'interface, sinon l'application
// embarque l'ancienne version.
import { copyFileSync, mkdirSync, statSync } from 'node:fs';

mkdirSync('app/assets', { recursive: true });
copyFileSync('dist/index.html', 'app/assets/app.html');
const ko = (statSync('app/assets/app.html').size / 1024).toFixed(0);
console.log(`app/assets/app.html écrit (${ko} Ko)`);
