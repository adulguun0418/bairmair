import type { Messages } from './mn';

/** English, the secondary catalog. */
export const en: Messages = {
  app: {
    name: 'bairmair',
    tagline: 'Explore apartments through a 3D model, a floor plan and photos',
  },
  nav: {
    samples: '3D samples',
  },
  language: {
    label: 'Language',
    mn: 'Монгол',
    en: 'English',
  },
  home: {
    title: 'See the apartment in 3D before you visit',
    body: 'On bairmair you explore apartments for sale and rent through a 3D model, a floor plan and photos. For now, there are sample apartments.',
    cta: 'View 3D samples',
  },
  notFound: {
    title: 'Page not found',
    back: 'Back to the home page',
  },
  rooms: {
    livingRoom: 'Living room',
    bedroom: 'Bedroom',
    kitchen: 'Kitchen',
    bathroom: 'Bathroom',
    diningRoom: 'Dining room',
    toilet: 'Toilet',
    hallway: 'Hallway',
    balcony: 'Balcony',
    storage: 'Storage',
    other: 'Room',
  },
  viewer: {
    label: '3D model',
    view3d: '3D',
    viewPlan: 'Floor plan',
    resetView: 'Reset view',
    hint: 'Drag to rotate · Pinch or scroll to zoom',
    webglUnavailable: 'This browser cannot show the 3D view. See the floor plan instead.',
    photoInRoom: 'Photo {{index}}: {{room}}',
    closePhoto: 'Close',
    rooms: 'Rooms',
    totalArea: 'Total area',
    approximateScanned: 'Approximate, from the scan',
  },
  samples: {
    title: 'Sample apartments in 3D',
    intro: 'Hand-made sample models. Real models come from a LiDAR scan with an iPhone Pro.',
    open: 'Open',
    names: {
      studio: 'Studio apartment',
      'two-room': 'Two-room apartment',
      'l-shaped': 'Apartment with an L-shaped living room',
    },
  },
};
