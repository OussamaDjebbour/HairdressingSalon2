/** Adds the back office's texts to the dictionary. Imported by AdminShell (every admin page) and the test setup. */
import { addTranslations } from '../context/LanguageContext';
import { adminTranslations } from './adminTranslations';

addTranslations(adminTranslations);
