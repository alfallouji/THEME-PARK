/**
 * The build catalogue: every placeable object with its footprint, cost and
 * simulation stats.
 *
 * Balance notes
 *  - `excitement` drives how much guests want to ride and what they'll pay.
 *  - `intensity` gates who will ride: timid guests avoid high-intensity rides.
 *  - `capacity` is riders per cycle, `cycle` the seconds per cycle.
 *  - `unlock` is the park rating required before the item appears unlocked.
 *  - `reliability` is the base chance of *not* breaking down per check.
 */
import * as flat from '../build/rides/flatRides.js';
import * as track from '../build/rides/trackRides.js';
import * as big from '../build/rides/bigRides.js';
import * as wild from '../build/rides/wildRides.js';
import * as shops from '../build/shops.js';
import * as deco from '../build/decorations.js';

export const CATEGORIES = [
  { id: 'path', name: 'Paths', emoji: '🛣️' },
  { id: 'gentle', name: 'Gentle Rides', emoji: '🎠' },
  { id: 'thrill', name: 'Thrill Rides', emoji: '🎢' },
  { id: 'water', name: 'Water & Track', emoji: '🚿' },
  { id: 'shop', name: 'Food & Shops', emoji: '🍔' },
  { id: 'facility', name: 'Facilities', emoji: '🚻' },
  { id: 'scenery', name: 'Scenery', emoji: '🌳' },
  { id: 'garden', name: 'Gardens', emoji: '🌷' },
];

/** @type {Record<string, any>} */
export const CATALOG = {};

function def(o) { CATALOG[o.id] = o; return o; }

/* ------------------------------------------------------------------ *
 * Gentle rides
 * ------------------------------------------------------------------ */
def({
  id: 'carousel', name: 'Grand Carousel', emoji: '🎠', cat: 'gentle',
  build: flat.carousel, w: 6, h: 6, cost: 1450, upkeep: 14,
  excitement: 3.2, intensity: 1.2, capacity: 12, cycle: 26, ticket: 5,
  reliability: 0.93, unlock: 0,
  blurb: 'A timeless family favourite. Low intensity, everyone rides it.',
});

def({
  id: 'teacups', name: 'Spinning Teacups', emoji: '🫖', cat: 'gentle',
  build: flat.teacups, w: 5, h: 5, cost: 1150, upkeep: 12,
  excitement: 3.6, intensity: 2.6, capacity: 18, cycle: 24, ticket: 5,
  reliability: 0.9, unlock: 0,
  blurb: 'Guests spin their own cup. Cheap, popular, slightly dizzying.',
});

def({
  id: 'balloonRace', name: 'Balloon Race', emoji: '🎈', cat: 'gentle',
  build: flat.balloonRace, w: 6, h: 6, cost: 1600, upkeep: 15,
  excitement: 3.4, intensity: 1.6, capacity: 12, cycle: 28, ticket: 6,
  reliability: 0.92, unlock: 120,
  blurb: 'Gentle lift-and-spin. Adored by families with small children.',
});

def({
  id: 'kiddieTrain', name: 'Park Express', emoji: '🚂', cat: 'gentle',
  build: track.kiddieTrain, w: 7, h: 7, cost: 2100, upkeep: 18,
  excitement: 3.0, intensity: 0.8, capacity: 12, cycle: 42, ticket: 5,
  reliability: 0.95, unlock: 100,
  blurb: 'A steam-puffing circuit. Very high satisfaction, very low thrills.',
});

def({
  id: 'ferrisWheel', name: 'Sky Wheel', emoji: '🎡', cat: 'gentle',
  build: big.ferrisWheel, w: 8, h: 6, cost: 4800, upkeep: 34,
  excitement: 5.4, intensity: 1.8, capacity: 32, cycle: 60, ticket: 9,
  reliability: 0.9, unlock: 260,
  blurb: 'A landmark visible across the whole park. Big scenery bonus.',
  scenery: 3, sceneryRadius: 16,
});

def({
  id: 'observationTower', name: 'Observation Tower', emoji: '🗼', cat: 'gentle',
  build: big.observationTower, w: 5, h: 5, cost: 4200, upkeep: 30,
  excitement: 4.6, intensity: 1.4, capacity: 12, cycle: 50, ticket: 8,
  reliability: 0.91, unlock: 320,
  blurb: 'Rotating glass cabin with a view over everything you have built.',
  scenery: 3, sceneryRadius: 18,
});

def({
  id: 'circusTent', name: 'Big Top Circus', emoji: '🎪', cat: 'gentle',
  build: big.circusTent, w: 8, h: 8, cost: 3900, upkeep: 40,
  excitement: 4.8, intensity: 0.6, capacity: 40, cycle: 75, ticket: 8,
  reliability: 0.97, unlock: 300,
  blurb: 'A show, not a ride — enormous capacity and it never breaks down.',
  scenery: 2, sceneryRadius: 14,
});

def({
  id: 'funhouse', name: 'Mirror Funhouse', emoji: '🪞', cat: 'gentle',
  build: big.funhouse, w: 5, h: 4, cost: 1800, upkeep: 14,
  excitement: 3.4, intensity: 1.0, capacity: 16, cycle: 34, ticket: 5,
  reliability: 0.95, unlock: 80,
  blurb: 'Walkthrough attraction. Cheap to run and rarely queues out.',
});

def({
  id: 'helterSkelter', name: 'Helter Skelter', emoji: '🎯', cat: 'gentle',
  build: big.helterSkelter, w: 4, h: 4, cost: 700, upkeep: 8,
  excitement: 2.8, intensity: 1.8, capacity: 8, cycle: 20, ticket: 4,
  reliability: 0.96, unlock: 0,
  blurb: 'The cheapest ride in the catalogue. A fine way to open a park.',
});

/* ------------------------------------------------------------------ *
 * Thrill rides
 * ------------------------------------------------------------------ */
def({
  id: 'pirateShip', name: 'Pirate Galleon', emoji: '🏴‍☠️', cat: 'thrill',
  build: flat.pirateShip, w: 6, h: 4, cost: 2600, upkeep: 24,
  excitement: 5.6, intensity: 5.4, capacity: 12, cycle: 34, ticket: 8,
  reliability: 0.88, unlock: 140,
  blurb: 'Swinging pendulum. Strong thrill draw for teens and adults.',
});

def({
  id: 'waveSwinger', name: 'Wave Swinger', emoji: '💺', cat: 'thrill',
  build: flat.waveSwinger, w: 7, h: 7, cost: 2900, upkeep: 26,
  excitement: 5.2, intensity: 4.4, capacity: 20, cycle: 36, ticket: 8,
  reliability: 0.89, unlock: 180,
  blurb: 'Chair swings that fly out and rise. Great capacity for the thrill.',
});

def({
  id: 'enterprise', name: 'Enterprise', emoji: '🛸', cat: 'thrill',
  build: flat.enterprise, w: 6, h: 6, cost: 3800, upkeep: 32,
  excitement: 6.4, intensity: 7.2, capacity: 16, cycle: 40, ticket: 11,
  reliability: 0.84, unlock: 340,
  blurb: 'Spins flat, then tilts to vertical. High intensity, high takings.',
});

def({
  id: 'bumperCars', name: 'Bumper Cars', emoji: '🚗', cat: 'thrill',
  build: flat.bumperCars, w: 6, h: 5, cost: 2300, upkeep: 22,
  excitement: 4.6, intensity: 3.4, capacity: 8, cycle: 30, ticket: 7,
  reliability: 0.87, unlock: 150,
  blurb: 'Crowd pleaser across every age group. Wears out its motors though.',
});

def({
  id: 'dropTower', name: 'Terror Drop', emoji: '🪂', cat: 'thrill',
  build: flat.dropTower, w: 5, h: 5, cost: 5200, upkeep: 42,
  excitement: 7.4, intensity: 8.6, capacity: 12, cycle: 44, ticket: 14,
  reliability: 0.8, unlock: 480,
  blurb: 'A 22 metre freefall. Enormous excitement — and a hefty repair bill.',
  scenery: 2, sceneryRadius: 14,
});

def({
  id: 'rollerCoaster', name: 'Thunderbolt Coaster', emoji: '🎢', cat: 'thrill',
  build: track.rollerCoaster, w: 8, h: 8, cost: 9500, upkeep: 68,
  excitement: 8.8, intensity: 7.6, capacity: 20, cycle: 56, ticket: 18,
  reliability: 0.78, unlock: 620,
  blurb: 'The headline attraction. Nothing pulls guests through the gate like it.',
  scenery: 4, sceneryRadius: 20,
});

def({
  id: 'hauntedHouse', name: 'Haunted Mansion', emoji: '👻', cat: 'thrill',
  build: big.hauntedHouse, w: 7, h: 6, cost: 3400, upkeep: 28,
  excitement: 5.8, intensity: 4.0, capacity: 24, cycle: 46, ticket: 9,
  reliability: 0.93, unlock: 240,
  blurb: 'Dark ride with ghosts and bats. Runs all night and rarely faults.',
  scenery: 2, sceneryRadius: 12,
});

/* ------------------------------------------------------------------ *
 * The eccentric ones
 * ------------------------------------------------------------------ */
def({
  id: 'octopus', name: 'Ozzy the Octopus', emoji: '🐙', cat: 'thrill',
  build: wild.octopus, w: 9, h: 9, cost: 4400, upkeep: 36,
  excitement: 6.0, intensity: 5.0, capacity: 18, cycle: 38, ticket: 10,
  reliability: 0.86, unlock: 300,
  blurb: 'Six tentacles heave up and down while the cars spin. Impossible to ignore.',
  scenery: 2, sceneryRadius: 12,
});

def({
  id: 'giantFrisbee', name: 'Giant Frisbee', emoji: '🛸', cat: 'thrill',
  build: wild.giantFrisbee, w: 7, h: 6, cost: 7200, upkeep: 56,
  excitement: 8.2, intensity: 8.8, capacity: 20, cycle: 46, ticket: 16,
  reliability: 0.79, unlock: 580,
  blurb: 'A spinning disc on a pendulum that swings past vertical. Not for the timid.',
  scenery: 3, sceneryRadius: 16,
});

def({
  id: 'ufoAbduction', name: 'UFO Abduction', emoji: '👽', cat: 'thrill',
  build: wild.ufoAbduction, w: 7, h: 7, cost: 5400, upkeep: 44,
  excitement: 6.6, intensity: 4.2, capacity: 8, cycle: 40, ticket: 12,
  reliability: 0.88, unlock: 380,
  blurb: 'A hovering saucer with a tractor beam. There is a cow. Do not ask.',
  scenery: 4, sceneryRadius: 15,
});

def({
  id: 'magicCarpet', name: 'Magic Carpet', emoji: '🧞', cat: 'thrill',
  build: wild.magicCarpet, w: 6, h: 5, cost: 3600, upkeep: 30,
  excitement: 6.2, intensity: 6.4, capacity: 8, cycle: 36, ticket: 10,
  reliability: 0.85, unlock: 260,
  blurb: 'Swings like a pendulum, then rolls straight over the top.',
});

def({
  id: 'reverseBungee', name: 'Reverse Bungee', emoji: '🚀', cat: 'thrill',
  build: wild.reverseBungee, w: 6, h: 6, cost: 6600, upkeep: 50,
  excitement: 8.6, intensity: 9.4, capacity: 2, cycle: 34, ticket: 22,
  reliability: 0.8, unlock: 640,
  blurb: 'Two riders, launched 24 metres up on elastic. Tiny capacity, enormous ticket.',
  scenery: 3, sceneryRadius: 16,
});

/* ------------------------------------------------------------------ *
 * Water & track
 * ------------------------------------------------------------------ */
def({
  id: 'logFlume', name: 'Log Flume', emoji: '🚿', cat: 'water',
  build: track.logFlume, w: 8, h: 8, cost: 6800, upkeep: 52,
  excitement: 7.0, intensity: 5.2, capacity: 12, cycle: 62, ticket: 13,
  reliability: 0.85, unlock: 520,
  blurb: 'Big splashdown finish. Guests love it most on hot, sunny days.',
  scenery: 3, sceneryRadius: 16,
});

def({
  id: 'goKarts', name: 'Grand Prix Karts', emoji: '🏎️', cat: 'water',
  build: track.goKarts, w: 8, h: 8, cost: 5600, upkeep: 46,
  excitement: 6.2, intensity: 4.8, capacity: 6, cycle: 70, ticket: 15,
  reliability: 0.82, unlock: 420,
  blurb: 'Low capacity but a very high ticket price. Watch the queue.',
});

/* ------------------------------------------------------------------ *
 * Shops
 * ------------------------------------------------------------------ */
const shopDef = (o) => def({ cat: 'shop', upkeep: 6, reliability: 0.97, ...o });

shopDef({
  id: 'burgerStand', name: 'Burger Shack', emoji: '🍔',
  build: shops.burgerStand, w: 3, h: 2, cost: 700,
  serves: 'hunger', price: 9, cogs: 3, unlock: 0,
  blurb: 'Solid hunger relief. Every park needs one near the entrance.',
});
shopDef({
  id: 'pizzaPlace', name: 'Pizza Kitchen', emoji: '🍕',
  build: shops.pizzaPlace, w: 3, h: 2, cost: 1100,
  serves: 'hunger', price: 12, cogs: 4, unlock: 160,
  blurb: 'Higher margin than burgers and it feeds guests for longer.',
});
shopDef({
  id: 'iceCream', name: 'Ice Cream Parlour', emoji: '🍦',
  build: shops.iceCream, w: 3, h: 2, cost: 650,
  serves: 'hunger', price: 7, cogs: 2, unlock: 0, weatherBoost: 'hot',
  blurb: 'Sells double on hot days. Also lifts the happiness of anyone nearby.',
});
shopDef({
  id: 'drinksStand', name: 'Drinks Kiosk', emoji: '🥤',
  build: shops.drinksStand, w: 3, h: 2, cost: 600,
  serves: 'thirst', price: 6, cogs: 1.5, unlock: 0,
  blurb: 'Thirsty guests leave early. This is the cheapest fix.',
});
shopDef({
  id: 'coffeeHut', name: 'Coffee Hut', emoji: '☕',
  build: shops.coffeeHut, w: 3, h: 2, cost: 900,
  serves: 'thirst', price: 8, cogs: 2, unlock: 140, weatherBoost: 'cold',
  blurb: 'Warms guests up when the weather turns. Great margins.',
});
shopDef({
  id: 'popcornCart', name: 'Popcorn Cart', emoji: '🍿',
  build: shops.popcornCart, w: 2, h: 2, cost: 480,
  serves: 'hunger', price: 6, cogs: 1.2, unlock: 0,
  blurb: 'Tiny footprint, squeezes into any corner of a busy midway.',
});
shopDef({
  id: 'candyShop', name: 'Candy Store', emoji: '🍬',
  build: shops.candyShop, w: 3, h: 2, cost: 850,
  serves: 'hunger', price: 8, cogs: 2, unlock: 200,
  blurb: 'Kids drag their parents in. Small happiness bonus on purchase.',
});
shopDef({
  id: 'souvenirShop', name: 'Souvenir Shop', emoji: '🎁',
  build: shops.souvenirShop, w: 3, h: 2, cost: 1300,
  serves: 'souvenir', price: 18, cogs: 5, unlock: 220,
  blurb: 'Guests buy on the way out. Scales with how happy they are.',
});
shopDef({
  id: 'balloonCart', name: 'Balloon Cart', emoji: '🎈',
  build: shops.balloonCart, w: 2, h: 2, cost: 400,
  serves: 'souvenir', price: 7, cogs: 1.5, unlock: 60, scenery: 1, sceneryRadius: 6,
  blurb: 'Cheap souvenir sales and a splash of colour on the midway.',
});
shopDef({
  id: 'hatShop', name: 'Hat Stall', emoji: '🎩',
  build: shops.hatShop, w: 3, h: 2, cost: 750,
  serves: 'souvenir', price: 12, cogs: 3.5, unlock: 180,
  blurb: 'Sells best on sunny days when guests want shade.',
  weatherBoost: 'hot',
});

/* ------------------------------------------------------------------ *
 * Facilities
 * ------------------------------------------------------------------ */
def({
  id: 'restroom', name: 'Restrooms', emoji: '🚻', cat: 'facility',
  build: shops.restroom, w: 3, h: 2, cost: 550, upkeep: 8,
  serves: 'toilet', price: 0, cogs: 0, reliability: 0.95, unlock: 0,
  blurb: 'Not optional. Guests with no restroom nearby get angry fast.',
});
def({
  id: 'firstAid', name: 'First Aid Post', emoji: '🚑', cat: 'facility',
  build: shops.firstAid, w: 2, h: 2, cost: 800, upkeep: 12,
  serves: 'nausea', price: 0, cogs: 0, reliability: 0.99, unlock: 200,
  blurb: 'Cures nausea from intense rides so guests keep spending.',
});
def({
  id: 'infoKiosk', name: 'Information Kiosk', emoji: 'ℹ️', cat: 'facility',
  build: shops.infoKiosk, w: 2, h: 2, cost: 450, upkeep: 6,
  serves: 'info', price: 0, cogs: 0, reliability: 0.99, unlock: 100,
  blurb: 'Lost guests find rides faster, which raises overall happiness.',
  scenery: 1, sceneryRadius: 8,
});
def({
  id: 'atm', name: 'Cash Machine', emoji: '🏧', cat: 'facility',
  build: shops.atm, w: 2, h: 2, cost: 900, upkeep: 10,
  serves: 'cash', price: 0, cogs: 0, reliability: 0.98, unlock: 260,
  blurb: 'Guests who run out of money top up instead of going home.',
});

/* ------------------------------------------------------------------ *
 * Scenery
 * ------------------------------------------------------------------ */
const sceneryDef = (o) => def({ cat: 'scenery', upkeep: 0, ...o });

sceneryDef({
  id: 'oakTree', name: 'Oak Tree', emoji: '🌳', build: deco.oakTree,
  w: 2, h: 2, cost: 90, scenery: 2, sceneryRadius: 7, unlock: 0,
});
sceneryDef({
  id: 'pineTree', name: 'Pine Tree', emoji: '🌲', build: deco.pineTree,
  w: 1, h: 1, cost: 70, scenery: 1.5, sceneryRadius: 6, unlock: 0,
});
sceneryDef({
  id: 'palmTree', name: 'Palm Tree', emoji: '🌴', build: deco.palmTree,
  w: 1, h: 1, cost: 120, scenery: 2, sceneryRadius: 7, unlock: 80,
});
sceneryDef({
  id: 'cherryTree', name: 'Cherry Blossom', emoji: '🌸', build: deco.cherryTree,
  w: 2, h: 2, cost: 210, scenery: 3.5, sceneryRadius: 8, unlock: 160,
});
sceneryDef({
  id: 'statue', name: 'Mascot Statue', emoji: '🗿', build: deco.statue,
  w: 1, h: 1, cost: 480, scenery: 3, sceneryRadius: 9, unlock: 220,
});
sceneryDef({
  id: 'gazebo', name: 'Gazebo', emoji: '⛩️', build: deco.gazebo,
  w: 3, h: 3, cost: 900, scenery: 5, sceneryRadius: 12, unlock: 300,
});
sceneryDef({
  id: 'clockTower', name: 'Clock Tower', emoji: '🕰️', build: deco.clockTower,
  w: 2, h: 2, cost: 1600, scenery: 7, sceneryRadius: 18, unlock: 400,
});
sceneryDef({
  id: 'bannerArch', name: 'Banner Arch', emoji: '🚩', build: deco.bannerArch,
  w: 3, h: 1, cost: 320, scenery: 2.5, sceneryRadius: 8, unlock: 120,
});
sceneryDef({
  id: 'fireworkLauncher', name: 'Firework Mortar', emoji: '🎆', build: deco.fireworkLauncher,
  w: 1, h: 1, cost: 1200, upkeep: 9, scenery: 4, sceneryRadius: 22, unlock: 450,
  blurb: 'Fires nightly displays. Every guest who sees one gets a happiness boost.',
});
sceneryDef({
  id: 'lampPost', name: 'Lamp Post', emoji: '💡', build: deco.lampPost,
  w: 1, h: 1, cost: 140, scenery: 1, sceneryRadius: 6, unlock: 0,
  blurb: 'Lights the path at night. Guests are happier on well-lit walkways.',
});
sceneryDef({
  id: 'bench', name: 'Park Bench', emoji: '🪑', build: deco.bench,
  w: 1, h: 1, cost: 60, scenery: 0.8, sceneryRadius: 5, unlock: 0,
  blurb: 'Tired guests rest here instead of leaving the park.',
});
sceneryDef({
  id: 'trashBin', name: 'Litter Bin', emoji: '🗑️', build: deco.trashBin,
  w: 1, h: 1, cost: 55, scenery: 0.2, sceneryRadius: 3, unlock: 0,
  blurb: 'Guests nearby throw litter in the bin instead of on your paths.',
});

/* ------------------------------------------------------------------ *
 * Gardens
 * ------------------------------------------------------------------ */
const gardenDef = (o) => def({ cat: 'garden', upkeep: 0, ...o });

gardenDef({
  id: 'flowerBed', name: 'Flower Bed', emoji: '🌷', build: deco.flowerBed,
  w: 1, h: 1, cost: 85, scenery: 2, sceneryRadius: 6, unlock: 0,
});
gardenDef({
  id: 'gardenPlanter', name: 'Planter Box', emoji: '🪴', build: deco.gardenPlanter,
  w: 1, h: 1, cost: 70, scenery: 1.6, sceneryRadius: 5, unlock: 0,
});
gardenDef({
  id: 'hedge', name: 'Hedge', emoji: '🌿', build: deco.hedge,
  w: 1, h: 1, cost: 50, scenery: 1.2, sceneryRadius: 4, unlock: 0,
});
gardenDef({
  id: 'topiary', name: 'Topiary', emoji: '🎍', build: deco.topiary,
  w: 1, h: 1, cost: 190, scenery: 2.6, sceneryRadius: 7, unlock: 140,
});
gardenDef({
  id: 'rockGarden', name: 'Zen Rock Garden', emoji: '🪨', build: deco.rockGarden,
  w: 2, h: 2, cost: 260, scenery: 3, sceneryRadius: 8, unlock: 180,
});
gardenDef({
  id: 'fountain', name: 'Grand Fountain', emoji: '⛲', build: deco.fountain,
  w: 3, h: 3, cost: 1100, scenery: 6, sceneryRadius: 14, unlock: 240,
});
gardenDef({
  id: 'pond', name: 'Koi Pond', emoji: '🪷', build: deco.pond,
  w: 3, h: 3, cost: 750, scenery: 4.5, sceneryRadius: 12, unlock: 200,
});

/* ------------------------------------------------------------------ *
 * Derived helpers
 * ------------------------------------------------------------------ */

/**
 * Footprint after rotation.
 *
 * Rotating a model by a quarter turn genuinely swaps the ground it covers, so
 * the grid reservation has to swap with it — otherwise a rotated 8x6 coaster
 * visually sits across 6x8 tiles while still blocking the original 8x6.
 */
export function rotatedFootprint(def, rotation = 0) {
  const quarter = Math.round(rotation / (Math.PI / 2)) & 3;
  return quarter % 2 ? { w: def.h, h: def.w } : { w: def.w, h: def.h };
}

/** Cost to pick something up and set it down somewhere else. */
export const RELOCATE_FRACTION = 0.2;

export function relocateCost(def) {
  return Math.max(10, Math.round(def.cost * RELOCATE_FRACTION));
}

export const RIDE_CATS = new Set(['gentle', 'thrill', 'water']);
export const SHOP_CATS = new Set(['shop', 'facility']);

export function isRide(def) { return RIDE_CATS.has(def.cat); }
export function isShop(def) { return def.cat === 'shop'; }
export function isFacility(def) { return def.cat === 'facility'; }
export function isScenery(def) { return def.cat === 'scenery' || def.cat === 'garden'; }

export function byCategory(cat) {
  return Object.values(CATALOG).filter((d) => d.cat === cat);
}

/** Cost to take a ride from `level` to `level + 1`. */
export function upgradeCost(def, level) {
  return Math.round(def.cost * (0.55 + level * 0.32));
}

/** Multipliers applied at each upgrade tier (index = level - 1). */
export const TIER = [
  { capacity: 1.0, excitement: 1.0, ticket: 1.0, reliability: 0.0, name: 'Standard' },
  { capacity: 1.35, excitement: 1.18, ticket: 1.25, reliability: 0.03, name: 'Deluxe' },
  { capacity: 1.7, excitement: 1.36, ticket: 1.5, reliability: 0.06, name: 'Spectacular' },
  { capacity: 2.1, excitement: 1.6, ticket: 1.85, reliability: 0.09, name: 'Legendary' },
];

export const MAX_LEVEL = TIER.length;
