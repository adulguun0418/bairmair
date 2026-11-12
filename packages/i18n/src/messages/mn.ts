/** Mongolian, the primary catalog. Every other catalog must have exactly these keys. */
export const mn = {
  app: {
    name: 'bairmair',
    tagline: 'Орон сууцыг 3D загвар, төлөвлөлт, зургаар нь үзээрэй',
  },
  nav: {
    samples: '3D жишээ',
  },
  language: {
    label: 'Хэл',
    mn: 'Монгол',
    en: 'English',
  },
  home: {
    title: 'Байрыг 3D-ээр үзээд сонго',
    body: 'bairmair дээр зарагдаж, түрээслэгдэж буй орон сууцыг 3D загвар, төлөвлөлт, зургаар нь үзнэ. Одоогоор жишээ загварууд байна.',
    cta: '3D жишээ үзэх',
  },
  notFound: {
    title: 'Хуудас олдсонгүй',
    back: 'Нүүр хуудас руу буцах',
  },
  rooms: {
    livingRoom: 'Зочны өрөө',
    bedroom: 'Унтлагын өрөө',
    kitchen: 'Гал тогоо',
    bathroom: 'Угаалгын өрөө',
    diningRoom: 'Хоолны өрөө',
    toilet: 'Ариун цэврийн өрөө',
    hallway: 'Коридор',
    balcony: 'Тагт',
    storage: 'Агуулах',
    other: 'Өрөө',
  },
  viewer: {
    label: '3D загвар',
    view3d: '3D',
    viewPlan: 'Төлөвлөлт',
    resetView: 'Анхны харагдац',
    hint: 'Чирж эргүүлэх · Чимхэж томруулах',
    webglUnavailable: 'Энэ хөтөч 3D харагдацыг дэмжихгүй байна. Төлөвлөлтийг үзнэ үү.',
    photoInRoom: 'Зураг {{index}}: {{room}}',
    closePhoto: 'Хаах',
    rooms: 'Өрөөнүүд',
    totalArea: 'Нийт талбай',
    approximateScanned: 'Сканаар хэмжсэн, ойролцоо',
  },
  samples: {
    title: '3D жишээ байрууд',
    intro: 'Гараар бэлтгэсэн жишээ загварууд. Бодит загвар нь iPhone Pro-гийн LiDAR сканаар үүснэ.',
    open: 'Үзэх',
    names: {
      studio: 'Студи байр',
      'two-room': '2 өрөө байр',
      'l-shaped': 'Г хэлбэрийн зочны өрөөтэй байр',
    },
  },
};

export type Messages = typeof mn;
