// What the public page imports: the server function (its handler never reaches the browser
// bundle) and the page itself.
export { fetchLanding, type Landing } from './functions';
export { LandingPage } from './ui';
