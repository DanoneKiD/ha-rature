// Registre des skins. Un skin est un module qui exporte `monter(racine, store)` et rend une
// fonction de démontage. Il reçoit le même store que les autres et dessine la liste à sa façon :
// un skin peut ne changer que le thème (CSS) ou toute la mise en page.
//
// Maquettes des dix pistes : maquettes/*.dc.html (le HTML utile est entre les balises <x-dc>).
// Seul le Carnet est réalisé ; les autres sont à faire, dans un ordre à choisir.
import * as carnet from './carnet/carnet.js';

export const SKINS = {
  carnet: { nom: 'Carnet de courses', module: carnet },
  // main:    { nom: 'Android natif' },        maquettes/Main.dc.html
  // things:  { nom: 'Façon Things' },         maquettes/Things.dc.html
  // ticket:  { nom: 'Ticket de caisse' },     maquettes/Ticket.dc.html
  // rayons:  { nom: 'Panneaux de rayons' },   maquettes/Rayons.dc.html
  // frigo:   { nom: 'Porte du frigo' },       maquettes/Frigo.dc.html
  // suisse:  { nom: 'Graphisme suisse' },     maquettes/Suisse.dc.html
  // brutal:  { nom: 'Néo-brutaliste' },       maquettes/Brutal.dc.html
  // ardoise: { nom: 'Ardoise du marché' },    maquettes/Ardoise.dc.html
  // matrice: { nom: 'Matrice de points' },    maquettes/Matrice.dc.html
};
