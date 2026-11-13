import type { Locale } from '@bairmair/i18n';
import type { ContentPage } from './types';

// About, help and account deletion. Legal documents are in privacy.ts and terms.ts.

export const aboutPage: Record<Locale, ContentPage> = {
  mn: {
    title: 'Бидний тухай',
    description:
      'bairmair бол Улаанбаатарын орон сууцыг 3D загвар, төлөвлөлт, зургаар нь үзэх боломжтой зарын платформ.',
    sections: [
      {
        id: 'why',
        heading: 'Яагаад bairmair вэ',
        blocks: [
          'Байр хайхад хамгийн их цаг зарцуулдаг зүйл бол очиж үзэх. Зураг өрөөний хэмжээ, байрлалыг харуулдаггүй, "2 өрөө" гэдэг нь юу гэсэн үг болохыг очиж байж л мэднэ. bairmair зарыг 3D загвар, төлөвлөлт, өрөө бүрийн талбайтай нь харуулснаар очиж үзэхээсээ өмнө байрныхаа талаар бодит ойлголт авах боломж олгоно.',
        ],
      },
      {
        id: 'buyers',
        heading: 'Худалдан авагч, түрээслэгчдэд',
        blocks: [
          {
            list: [
              'Зарагдах, түрээсийн байрыг дүүрэг, үнэ, өрөө, талбайгаар хайх, газрын зураг дээр харах.',
              '3D загварыг эргүүлж үзэх, төлөвлөлт дээрээс өрөө бүрийн талбай, тухайн өрөөний зургийг харах.',
              '1 м²-ийн үнийг дүүргийн дундажтай харьцуулах.',
              'Зар эзэнтэй шууд утсаар холбогдох.',
            ],
          },
        ],
      },
      {
        id: 'sellers',
        heading: 'Байраа зарах, түрээслүүлэх хүмүүс, агентуудад',
        blocks: [
          {
            list: [
              'Зураг, мэдээллээ оруулаад үнэгүй зар байршуулах.',
              'LiDAR мэдрэгчтэй iPhone Pro-оор байраа скан хийхэд 3D загвар, төлөвлөлт автоматаар гарна. 3D загвартай зар хайлтад түрүүлж харагдана.',
              'Зарын холбоосыг Facebook, бусад сайтад хуваалцахад төлөвлөлтийн зураг, үнэ, талбай нь харагдана.',
              'Агентууд олон зараа нэг хуудсанд харуулна.',
            ],
          },
        ],
      },
      {
        id: 'contact',
        heading: 'Холбоо барих',
        blocks: [{ contact: true }],
      },
    ],
  },
  en: {
    title: 'About us',
    description:
      'bairmair is a listings platform where you explore Ulaanbaatar apartments through 3D models, floor plans and photos.',
    sections: [
      {
        id: 'why',
        heading: 'Why bairmair',
        blocks: [
          'Viewings take most of the time in an apartment search. Photos do not show how big rooms are or how they connect, and what "2 rooms" really means only becomes clear on site. bairmair shows listings with a 3D model, a floor plan and the area of every room, so you understand an apartment before you go and see it.',
        ],
      },
      {
        id: 'buyers',
        heading: 'For buyers and renters',
        blocks: [
          {
            list: [
              'Search apartments for sale or rent by district, price, rooms and area, or on the map.',
              'Turn the 3D model around, and see each room’s area and photos on the floor plan.',
              'Compare the price per m² with the district average.',
              'Call the seller directly.',
            ],
          },
        ],
      },
      {
        id: 'sellers',
        heading: 'For owners and agents',
        blocks: [
          {
            list: [
              'Post a listing for free with photos and details.',
              'Scan the apartment with a LiDAR iPhone Pro and get a 3D model and floor plan automatically. Listings with a 3D model rank first in search.',
              'Shared links on Facebook and other sites show the floor plan, price and area.',
              'Agents show all their listings on one page.',
            ],
          },
        ],
      },
      {
        id: 'contact',
        heading: 'Contact',
        blocks: [{ contact: true }],
      },
    ],
  },
};

export const supportPage: Record<Locale, ContentPage> = {
  mn: {
    title: 'Тусламж ба холбоо барих',
    description: 'Түгээмэл асуултын хариулт, бидэнтэй холбогдох хаяг.',
    sections: [
      {
        id: 'contact',
        heading: 'Холбоо барих',
        blocks: [
          'Асуулт, санал, гомдлоо доорх хаягаар илгээнэ үү. Ажлын өдрүүдэд хариулна.',
          { contact: true },
        ],
      },
      {
        id: 'post',
        heading: 'Зар хэрхэн байршуулах вэ?',
        blocks: [
          'Утасны дугаараараа нэвтэрч, "Зар нэмэх" товчийг дарна. Мэдээлэл, байршил, зургаа оруулаад "Нийтлэх" дарна. Нийтлэхийн тулд утасны дугаар баталгаажсан байх ёстой. Вэбсайт болон аппликейшнээс аль алинаас нь хийх боломжтой.',
        ],
      },
      {
        id: 'scan',
        heading: '3D скан хэрхэн хийх вэ?',
        blocks: [
          '3D скан хийхэд LiDAR мэдрэгчтэй iPhone Pro, Pro Max (12 Pro болон түүнээс хойшхи), iOS 17 буюу түүнээс хойшхи хувилбар хэрэгтэй. Аппликейшнд зараа нээгээд "3D скан" хэсгээс эхлүүлнэ. Байрныхаа бүх өрөөгөөр хаалгаар нь орж гарч алхаад "Дуусгах" дарна. Бусад утсаар зургаар зар байршуулах боломжтой.',
        ],
      },
      {
        id: 'available',
        heading: 'Миний зар яагаад хайлтад харагдахгүй байна вэ?',
        blocks: [
          'Нийтлэгдсэн зар 14 хоногийн дотор "Байр боломжтой хэвээр байна" гэж баталгаажуулаагүй бол хайлтаас нуугдана. Миний зарууд хэсгээс зараа нээж баталгаажуулна уу. Холбоосоор нь орсон хүмүүст зар харагдсаар байна.',
        ],
      },
      {
        id: 'sms',
        heading: 'SMS код ирэхгүй байна',
        blocks: [
          'Дугаараа зөв бичсэн эсэхээ шалгаад 1 минутын дараа дахин код авна уу. Монголын үүрэн холбооны дугааруудад л SMS илгээдэг. Асуудал үргэлжилбэл бидэнтэй холбогдоно уу.',
        ],
      },
      {
        id: 'report',
        heading: 'Худал эсвэл зөрчилтэй зар',
        blocks: [
          'Зарын хуудсан дээрх "Зөрчилтэй зар мэдээлэх" товчийг дарж шалтгаанаа сонгоно уу. Бид шалгаад шаардлагатай бол зарыг хасна.',
        ],
      },
      {
        id: 'delete',
        heading: 'Бүртгэлээ хэрхэн устгах вэ?',
        blocks: [{ link: { label: 'Бүртгэл устгах заавар', href: '/delete-account' } }],
      },
    ],
  },
  en: {
    title: 'Help & contact',
    description: 'Answers to common questions, and how to reach us.',
    sections: [
      {
        id: 'contact',
        heading: 'Contact',
        blocks: [
          'Send questions, suggestions or complaints to the address below. We reply on working days.',
          { contact: true },
        ],
      },
      {
        id: 'post',
        heading: 'How do I post a listing?',
        blocks: [
          'Sign in with your phone number and choose "Post a listing". Enter the details, location and photos, then "Publish". Publishing needs a verified phone number. You can do this on the website or in the app.',
        ],
      },
      {
        id: 'scan',
        heading: 'How do I make a 3D scan?',
        blocks: [
          'A 3D scan needs an iPhone Pro or Pro Max with a LiDAR sensor (12 Pro or later) running iOS 17 or later. In the app, open your listing and start from the "3D scan" section. Walk through every room of the apartment, through each doorway, then tap "Finish". On other phones you can post a listing with photos.',
        ],
      },
      {
        id: 'available',
        heading: 'Why is my listing not in search?',
        blocks: [
          'A published listing is hidden from search if it is not confirmed as "Still available" within 14 days. Open it from My listings and confirm. People with the link can still see it.',
        ],
      },
      {
        id: 'sms',
        heading: 'I did not get the SMS code',
        blocks: [
          'Check the number and request a new code after a minute. SMS codes are sent to Mongolian mobile numbers only. Contact us if it still does not arrive.',
        ],
      },
      {
        id: 'report',
        heading: 'A listing is fake or breaks the rules',
        blocks: [
          'Use "Report this listing" on the listing page and choose a reason. We review reports and remove listings where needed.',
        ],
      },
      {
        id: 'delete',
        heading: 'How do I delete my account?',
        blocks: [{ link: { label: 'How to delete your account', href: '/delete-account' } }],
      },
    ],
  },
};

export const deleteAccountPage: Record<Locale, ContentPage> = {
  mn: {
    title: 'Бүртгэл устгах',
    description: 'bairmair бүртгэлээ болон түүнтэй холбоотой мэдээллээ хэрхэн устгах вэ.',
    sections: [
      {
        id: 'app',
        heading: 'Аппликейшнээс',
        blocks: [
          {
            list: [
              'bairmair аппыг нээгээд доод цэсний "Бүртгэл" рүү орно.',
              'Хуудасны доод хэсэгт "Бүртгэл устгах"-ыг дарна.',
              'Юу устахыг уншаад баталгаажуулна.',
            ],
          },
        ],
      },
      {
        id: 'web',
        heading: 'Вэбсайтаас',
        blocks: [
          'Нэвтэрч ороод Бүртгэл хуудасны доод хэсэгт "Бүртгэл устгах"-ыг дарж баталгаажуулна.',
          { link: { label: 'Бүртгэл хуудас руу очих', href: '/account' } },
        ],
      },
      {
        id: 'what',
        heading: 'Юу устах вэ',
        blocks: [
          'Бүртгэл устгахад дараах мэдээлэл тэр даруй, бүрмөсөн устна. Үүнийг буцаах боломжгүй.',
          {
            list: [
              'Бүртгэл, утасны дугаар, нэр, зураг, агентын мэдээлэл.',
              'Бүх зар: мэдээлэл, зураг, 3D скан, төлөвлөлт, байршил, үзэлтийн тоо.',
              'Хадгалсан зарууд, таны илгээсэн гомдол.',
            ],
          },
          'Бусдын зар дээр таны утасны дугаар харсан бүртгэл (урвуулан ашиглалтаас сэргийлэх) таны бүртгэлгүйгээр үлдэнэ. Устгасан мэдээлэл нөөц хуулбарт хязгаарлагдмал хугацаанд үлдэж болно.',
        ],
      },
      {
        id: 'help',
        heading: 'Нэвтэрч чадахгүй байна уу?',
        blocks: [
          'Бүртгэлдээ нэвтэрч чадахгүй бол бүртгэлтэй утасны дугаараа бичээд доорх хаягаар устгах хүсэлт илгээнэ үү. Дугаар таных эсэхийг шалгасны дараа устгана.',
          { contact: true },
        ],
      },
    ],
  },
  en: {
    title: 'Delete your account',
    description: 'How to delete your bairmair account and the data that goes with it.',
    sections: [
      {
        id: 'app',
        heading: 'In the app',
        blocks: [
          {
            list: [
              'Open the bairmair app and go to the "Account" tab.',
              'At the bottom of the screen, tap "Delete account".',
              'Read what will be deleted and confirm.',
            ],
          },
        ],
      },
      {
        id: 'web',
        heading: 'On the website',
        blocks: [
          'Sign in, and at the bottom of the Account page choose "Delete account" and confirm.',
          { link: { label: 'Go to your account', href: '/account' } },
        ],
      },
      {
        id: 'what',
        heading: 'What is deleted',
        blocks: [
          'Deleting your account permanently removes the following straight away. It cannot be undone.',
          {
            list: [
              'Your account, phone number, name, picture and agent details.',
              'All your listings: details, photos, 3D scans, floor plans, location and view counts.',
              'Your saved listings and the reports you sent.',
            ],
          },
          'Records of you viewing phone numbers on other people’s listings (kept to prevent abuse) remain, without your account. Deleted data may remain in backups for a limited period.',
        ],
      },
      {
        id: 'help',
        heading: 'Cannot sign in?',
        blocks: [
          'If you cannot sign in, send a deletion request with the phone number of your account to the address below. We delete the account after confirming the number is yours.',
          { contact: true },
        ],
      },
    ],
  },
};
