import type { Locale } from '@bairmair/i18n';
import { SITE_INFO } from './site-info';
import type { ContentPage } from './types';

// Draft for legal review. Describes what the code actually does; update it with the code
// (new processors such as error reporting, analytics, payments) and bump SITE_INFO.legalUpdated.

const mn: ContentPage = {
  title: 'Нууцлалын бодлого',
  description:
    'bairmair таны ямар мэдээллийг цуглуулж, юунд ашиглаж, хэрхэн хамгаалдаг, мөн таны эрхийн тухай.',
  legal: true,
  sections: [
    {
      id: 'who',
      heading: '1. Бид хэн бэ',
      blocks: [
        `bairmair нь Монгол Улсад орон сууц зарах, түрээслэх зар байршуулж, 3D загвар, төлөвлөлт, зургаар нь үзэх боломж олгодог вэбсайт болон гар утасны аппликейшн юм (цаашид "үйлчилгээ"). Үйлчилгээг ${SITE_INFO.operator.mn} (регистрийн дугаар ${SITE_INFO.registrationNumber}) эрхлэн гаргадаг бөгөөд таны хувь хүний мэдээллийг хариуцан боловсруулагч мөн.`,
        'Энэхүү бодлого нь Монгол Улсын Хувь хүний мэдээлэл хамгаалах тухай хуульд нийцүүлэн бичигдсэн.',
      ],
    },
    {
      id: 'collect',
      heading: '2. Бидний цуглуулдаг мэдээлэл',
      blocks: [
        'Бүртгэл:',
        {
          list: [
            'Утасны дугаар: SMS кодоор нэвтрэх, бүртгэлээ баталгаажуулахад.',
            'Apple эсвэл Google-ээр нэвтэрвэл тухайн үйлчилгээ бидэнд өгсөн танигч, и-мэйл хаяг (Apple-ийн нууцалсан хаяг байж болно).',
            'Нэр, зураг, агент бол агентлагийн нэр, танилцуулга.',
          ],
        },
        'Зар:',
        {
          list: [
            'Таны оруулсан мэдээлэл: үнэ, талбай, өрөө, давхар, тайлбар гэх мэт.',
            'Зургууд. Утсан дээр болон хөтөч дээр байршуулахын өмнө зургийн байршлын (GPS) болон бусад мета мэдээллийг устгадаг.',
            '3D скан: өрөөний хана, хаалга, цонх, тавилгын хэмжээ, байрлал, түүнчлэн сканы эх файлууд (RoomPlan JSON, USDZ). Эх файлуудыг зөвхөн загвар, төлөвлөлтийг дахин гаргахад ашиглах бөгөөд олон нийтэд нээлттэй биш.',
            'Байршил: дүүрэг, хороо, хотхон, газрын зураг дээрх цэг, тоот. Яг байршил болон тоотыг зөвхөн та харна; бусад хүмүүс ойролцоо байршлыг (барилгын орчим) харна, хэрэв та яг байршлаа харуулахыг сонгоогүй бол.',
            'Скан хийх үеийн утасны байршил: зар "байран дээр скан хийсэн" тэмдэг авах эсэхийг шалгахад. Энэ байршил нийтэд харагдахгүй.',
          ],
        },
        'Үйлчилгээг ашиглах үед:',
        {
          list: [
            'Хадгалсан зарууд, илгээсэн гомдол (шалтгаан, тайлбар).',
            'Зар үзсэн тоо. Зочин "Утасны дугаар харах" товчийг дарахад урвуулан ашиглахаас сэргийлэхийн тулд IP хаяг, нэвтэрсэн бол хэрэглэгчийн дугаарыг тэмдэглэнэ.',
            'Төхөөрөмж, хөтчийн техникийн мэдээлэл, IP хаяг (серверийн бүртгэлд).',
            'Та "Одоогийн байршлаа ашиглах" товчийг дарсан үед л утасны байршлыг уншина.',
          ],
        },
        'Бид зар сурталчилгааны зорилгоор хянах (tracking) хэрэгсэл, гуравдагч талын аналитик ашигладаггүй.',
      ],
    },
    {
      id: 'use',
      heading: '3. Мэдээллийг юунд ашигладаг вэ',
      blocks: [
        {
          list: [
            'Таныг нэвтрүүлэх, бүртгэлийг тань хамгаалах.',
            'Зарыг тань нийтлэх, хайлт, газрын зураг, хуваалцах холбоосоор харуулах.',
            '3D загвар, төлөвлөлт, талбайн тооцоог гаргах.',
            'Худал зар, спам, урвуулан ашиглалтаас сэргийлэх, гомдлыг шийдвэрлэх.',
            'Үйлчилгээг сайжруулах, алдааг засах.',
            'Хуулиар хүлээсэн үүргээ биелүүлэх.',
          ],
        },
        'Бид таны мэдээллийг таны зөвшөөрөл, үйлчилгээ үзүүлэх гэрээ, хуулиар хүлээсэн үүргийн үндсэн дээр боловсруулдаг.',
      ],
    },
    {
      id: 'public',
      heading: '4. Нийтэд харагдах мэдээлэл',
      blocks: [
        'Нийтлэгдсэн зарын мэдээлэл, зураг, 3D загвар, төлөвлөлт, ойролцоо байршил, таны нэр (агент бол агентын хуудас) хэнд ч харагдана. Зарын холбоосыг Facebook зэрэг сайтад хуваалцах боломжтой.',
        'Таны утасны дугаар зарын хуудсанд шууд бичигдэхгүй: зочин "Утасны дугаар харах" товчийг дарсны дараа харагдана. Дарах тоог хязгаарласан.',
      ],
    },
    {
      id: 'share',
      heading: '5. Мэдээллийг хэнтэй хуваалцдаг вэ',
      blocks: [
        'Бид таны мэдээллийг худалдахгүй. Үйлчилгээг ажиллуулахад дараах үйлчилгээ үзүүлэгчид бидний өмнөөс мэдээлэл боловсруулна:',
        {
          list: [
            'Supabase: өгөгдлийн сан, нэвтрэлт, файл хадгалалт (серверүүд Бүгд Найрамдах Солонгос Улсын Сөүл хотод).',
            'Vercel: вэбсайтын хостинг.',
            'WeSend: нэвтрэх кодыг SMS-ээр илгээх.',
            'Cloudflare Turnstile: вэбсайтаар нэвтрэхэд робот биш эсэхийг шалгах.',
            'Apple, Google: та тэдгээрээр нэвтэрвэл.',
            'OpenFreeMap: газрын зургийн зураг (таны хөтөч, апп шууд хүсэлт илгээнэ).',
            'Expo: аппликейшний шинэчлэлийг хүргэх.',
          ],
        },
        'Хуулийн дагуу эрх бүхий байгууллага шаардсан тохиолдолд мэдээллийг өгч болно.',
      ],
    },
    {
      id: 'abroad',
      heading: '6. Мэдээллийг гадаадад хадгалах',
      blocks: [
        'Бидний өгөгдлийн сан, файлууд Монгол Улсаас гадна (Бүгд Найрамдах Солонгос Улс) байрлах серверт хадгалагдана. Үйлчилгээ үзүүлэгчид мэдээллийг шифрлэн дамжуулж, хадгалдаг.',
      ],
    },
    {
      id: 'retention',
      heading: '7. Хадгалах хугацаа',
      blocks: [
        'Бүртгэл, зарын мэдээллийг та устгах хүртэл хадгална. Бүртгэлээ устгахад зар, зураг, скан, хадгалсан зар зэрэг холбогдох мэдээлэл устна. Устгасан мэдээлэл нөөц хуулбарт хязгаарлагдмал хугацаанд үлдэж болно. Урвуулан ашиглалтаас сэргийлэх бүртгэлийг шаардлагатай хугацаанд л хадгална.',
      ],
    },
    {
      id: 'rights',
      heading: '8. Таны эрх',
      blocks: [
        {
          list: [
            'Өөрийн мэдээлэлтэй танилцах, хуулбар авах.',
            'Буруу мэдээллийг засуулах (ихэнхийг нь бүртгэл, зарын хэсгээс өөрөө засах боломжтой).',
            'Мэдээллээ устгуулах, зөвшөөрлөө цуцлах (бүртгэл устгах).',
            'Хүний эрхийн үндэсний комисст гомдол гаргах.',
          ],
        },
        'Хүсэлтээ доорх холбоо барих хаягаар илгээнэ үү.',
      ],
    },
    {
      id: 'delete',
      heading: '9. Бүртгэлээ устгах',
      blocks: [
        'Аппликейшнд: Бүртгэл → Бүртгэл устгах. Вэбсайтад: Бүртгэл хуудас → Бүртгэл устгах. Дэлгэрэнгүйг "Бүртгэл устгах" хуудаснаас үзнэ үү.',
        { link: { label: 'Бүртгэл устгах заавар', href: '/delete-account' } },
      ],
    },
    {
      id: 'children',
      heading: '10. Хүүхэд',
      blocks: [
        'Үйлчилгээ нь 18 нас хүрсэн хүнд зориулагдсан. 18 хүрээгүй хүн бүртгэл үүсгэх ёсгүй.',
      ],
    },
    {
      id: 'security',
      heading: '11. Аюулгүй байдал',
      blocks: [
        'Мэдээллийг шифрлэсэн холболтоор (HTTPS) дамжуулж, мэдээлэл бүрт хэн хандахыг өгөгдлийн сангийн түвшинд хязгаарладаг. Гэвч интернэтээр дамжих мэдээллийг 100% хамгаалах боломжгүй гэдгийг анхаарна уу.',
      ],
    },
    {
      id: 'changes',
      heading: '12. Өөрчлөлт',
      blocks: [
        'Бодлогыг өөрчлөх тохиолдолд энэ хуудсанд шинэчилсэн огноог тавьж, чухал өөрчлөлтийг аппликейшн эсвэл SMS-ээр мэдэгдэнэ.',
      ],
    },
    {
      id: 'contact',
      heading: '13. Холбоо барих',
      blocks: [{ contact: true }],
    },
  ],
};

const en: ContentPage = {
  title: 'Privacy policy',
  description:
    'What information bairmair collects, what we use it for, how we protect it, and your rights.',
  legal: true,
  sections: [
    {
      id: 'who',
      heading: '1. Who we are',
      blocks: [
        `bairmair is a website and mobile app for apartment sale and rent listings in Mongolia, viewed through 3D models, floor plans and photos (the "service"). The service is run by ${SITE_INFO.operator.en} (registration number ${SITE_INFO.registrationNumber}), which is responsible for your personal data.`,
        'This policy is written to comply with the Law of Mongolia on Personal Data Protection.',
      ],
    },
    {
      id: 'collect',
      heading: '2. Information we collect',
      blocks: [
        'Account:',
        {
          list: [
            'Phone number: to sign in with an SMS code and verify your account.',
            'If you sign in with Apple or Google: the identifier and e-mail address that service gives us (with Apple, possibly a private relay address).',
            'Name, picture, and for agents the agency name and bio.',
          ],
        },
        'Listings:',
        {
          list: [
            'What you enter: price, area, rooms, floor, description and so on.',
            'Photos. Location (GPS) and other metadata are removed from photos on your phone or in your browser before they are uploaded.',
            '3D scans: the size and position of walls, doors, windows and furniture, plus the original scan files (RoomPlan JSON, USDZ). The original files are used only to rebuild the model and floor plan and are never public.',
            'Location: district, khoroo, building or complex, the map pin and the unit number. Only you see the exact location and the unit number; others see an approximate location (the building area) unless you choose to show the exact one.',
            'Your phone\'s location during a scan: to check whether the listing earns the "scanned on-site" badge. It is never shown publicly.',
          ],
        },
        'When you use the service:',
        {
          list: [
            'Saved listings and reports you send (reason and details).',
            'Listing view counts. When a visitor taps "Show phone number", we record their IP address and, if signed in, their user ID, to prevent abuse.',
            'Technical device and browser information and IP addresses (in server logs).',
            'Your device location, only when you tap "Use my current location".',
          ],
        },
        'We do not use advertising trackers or third-party analytics.',
      ],
    },
    {
      id: 'use',
      heading: '3. How we use it',
      blocks: [
        {
          list: [
            'To sign you in and keep your account secure.',
            'To publish your listings and show them in search, on the map and through shared links.',
            'To produce 3D models, floor plans and area calculations.',
            'To prevent fake listings, spam and abuse, and to handle reports.',
            'To improve the service and fix problems.',
            'To meet our legal obligations.',
          ],
        },
        'We process your data on the basis of your consent, the contract to provide the service, and our legal obligations.',
      ],
    },
    {
      id: 'public',
      heading: '4. What is public',
      blocks: [
        'Published listing details, photos, 3D models, floor plans, the approximate location and your name (for agents, the agent page) are visible to anyone. Listing links can be shared on sites such as Facebook.',
        'Your phone number is not written on the listing page: a visitor sees it after tapping "Show phone number", and how often they can do so is limited.',
      ],
    },
    {
      id: 'share',
      heading: '5. Who we share it with',
      blocks: [
        'We do not sell your data. These providers process data on our behalf to run the service:',
        {
          list: [
            'Supabase: database, sign-in and file storage (servers in Seoul, Republic of Korea).',
            'Vercel: website hosting.',
            'WeSend: sending sign-in codes by SMS.',
            'Cloudflare Turnstile: checking that website sign-ins come from a person.',
            'Apple and Google: if you sign in with them.',
            'OpenFreeMap: map imagery (your browser or app requests it directly).',
            'Expo: delivering app updates.',
          ],
        },
        'We may disclose data to authorities when the law requires it.',
      ],
    },
    {
      id: 'abroad',
      heading: '6. Storage outside Mongolia',
      blocks: [
        'Our database and files are stored on servers outside Mongolia (in the Republic of Korea). Our providers encrypt data in transit and at rest.',
      ],
    },
    {
      id: 'retention',
      heading: '7. How long we keep it',
      blocks: [
        'Account and listing data are kept until you delete them. Deleting your account deletes your listings, photos, scans, saved listings and related data. Deleted data may remain in backups for a limited period. Abuse-prevention records are kept only as long as needed.',
      ],
    },
    {
      id: 'rights',
      heading: '8. Your rights',
      blocks: [
        {
          list: [
            'To see your data and get a copy.',
            'To have incorrect data corrected (you can edit most of it yourself in your account and listings).',
            'To have your data deleted and withdraw consent (by deleting your account).',
            'To complain to the National Human Rights Commission of Mongolia.',
          ],
        },
        'Send requests to the contact details below.',
      ],
    },
    {
      id: 'delete',
      heading: '9. Deleting your account',
      blocks: [
        'In the app: Account → Delete account. On the website: Account page → Delete account. See the "Delete your account" page for details.',
        { link: { label: 'How to delete your account', href: '/delete-account' } },
      ],
    },
    {
      id: 'children',
      heading: '10. Children',
      blocks: ['The service is for people aged 18 and over. Under-18s must not create an account.'],
    },
    {
      id: 'security',
      heading: '11. Security',
      blocks: [
        'Data travels over encrypted connections (HTTPS), and the database itself restricts who can access each record. No transmission over the internet is completely secure, however.',
      ],
    },
    {
      id: 'changes',
      heading: '12. Changes',
      blocks: [
        'When this policy changes, we update the date on this page and announce important changes in the app or by SMS.',
      ],
    },
    {
      id: 'contact',
      heading: '13. Contact',
      blocks: [{ contact: true }],
    },
  ],
};

export const privacyPage: Record<Locale, ContentPage> = { mn, en };
