import type { Locale } from '@bairmair/i18n';
import { SITE_INFO } from './site-info';
import type { ContentPage } from './types';

// Draft for legal review. Bump SITE_INFO.legalUpdated when it changes.

const mn: ContentPage = {
  title: 'Үйлчилгээний нөхцөл',
  description: 'bairmair вэбсайт, аппликейшнийг ашиглах нөхцөл.',
  legal: true,
  sections: [
    {
      id: 'accept',
      heading: '1. Нөхцөлийг хүлээн зөвшөөрөх',
      blocks: [
        `Эдгээр нөхцөл нь ${SITE_INFO.operator.mn}-ийн (цаашид "бид") эрхлэн гаргадаг bairmair вэбсайт болон аппликейшнийг (цаашид "үйлчилгээ") ашиглахтай холбоотой харилцааг зохицуулна. Үйлчилгээг ашигласнаар, эсвэл бүртгэл үүсгэснээр та эдгээр нөхцөл болон Нууцлалын бодлогыг хүлээн зөвшөөрч байна.`,
      ],
    },
    {
      id: 'service',
      heading: '2. Үйлчилгээ',
      blocks: [
        'bairmair нь орон сууц зарах, түрээслэх хүмүүс болон агентуудын зарыг байршуулж, худалдан авагч, түрээслэгчдэд харуулдаг зарын платформ юм.',
        'Бид худалдаа, түрээсийн гэрээний тал биш, зуучлагч биш, үл хөдлөх хөрөнгийн өмчлөл, байдал, үнийг баталгаажуулдаггүй. Гэрээ байгуулах, төлбөр хийхээс өмнө байр, бичиг баримтыг өөрөө шалгана уу.',
        'Одоогоор зар байршуулах үнэгүй. Төлбөртэй үйлчилгээ нэвтрүүлбэл үнэ, нөхцөлийг урьдчилан мэдэгдэнэ.',
      ],
    },
    {
      id: 'account',
      heading: '3. Бүртгэл',
      blocks: [
        {
          list: [
            'Бүртгэл үүсгэхийн тулд та 18 нас хүрсэн байх ёстой.',
            'Үнэн зөв мэдээлэл өгч, утасны дугаараа баталгаажуулна.',
            'Бүртгэлийнхээ аюулгүй байдлыг та хариуцна; нэвтрэх кодоо хэнд ч бүү өгөөрэй.',
            'Нэг хүн өөр хүний нэрээр бүртгэл үүсгэх, бусдын бүртгэлийг ашиглахыг хориглоно.',
          ],
        },
      ],
    },
    {
      id: 'listings',
      heading: '4. Зар байршуулах дүрэм',
      blocks: [
        'Зар байршуулахдаа та дараахыг баталж байна:',
        {
          list: [
            'Та байрны өмчлөгч, эсвэл өмчлөгчийн зөвшөөрөлтэй агент.',
            'Зарын мэдээлэл, үнэ, зураг тухайн байранд хамаарах, үнэн зөв, одоо хүчинтэй.',
            'Зураг, тайлбарыг ашиглах эрхтэй.',
            'Нэг байрыг давхардуулж, эсвэл хуурамч үнээр байршуулахгүй.',
            'Байр зарагдсан, түрээслэгдсэн бол зарыг шинэчилнэ. Нийтлэгдсэн зар 14 хоног тутамд "Байр боломжтой хэвээр байна" гэж баталгаажуулаагүй бол хайлтаас нуугдана.',
          ],
        },
        'Дараах агуулгыг хориглоно: хууль бус, хуурамч, төөрөгдүүлсэн, бусдын эрхийг зөрчсөн, доромжилсон, хувь хүний мэдээлэл (бусдын) агуулсан, мөн зартай хамааралгүй сурталчилгаа.',
      ],
    },
    {
      id: 'scans',
      heading: '5. 3D скан ба талбай',
      blocks: [
        '3D загвар, төлөвлөлт, өрөөний талбайг утасны LiDAR мэдрэгчээр хийсэн сканаас автоматаар гаргадаг бөгөөд ойролцоо утга юм. Албан ёсны талбай нь үл хөдлөх хөрөнгийн гэрчилгээнд бичигдсэн талбай байна. Скан хийсэн талбайд үндэслэн шийдвэр гаргахгүй байхыг зөвлөж байна.',
        '"Байран дээр скан хийсэн" тэмдэг нь скан хийх үеийн утасны байршил зарын байршилтай ойролцоо байсныг харуулна; энэ нь баталгаа биш.',
      ],
    },
    {
      id: 'content',
      heading: '6. Таны агуулга',
      blocks: [
        'Таны байршуулсан зураг, тайлбар, скан таных хэвээр үлдэнэ. Та бидэнд тэдгээрийг үйлчилгээнд харуулах, хуваалцах холбоос, урьдчилсан зураг (жишээ нь Facebook-т харагдах төлөвлөлтийн зураг) үүсгэх, үйлчилгээг сурталчлахад ашиглах, үнэ төлбөргүй, онцгой бус эрхийг олгож байна. Энэ эрх агуулгыг устгахад дуусгавар болно.',
      ],
    },
    {
      id: 'moderation',
      heading: '7. Хяналт ба гомдол',
      blocks: [
        'Хэрэглэгчид "Зөрчилтэй зар мэдээлэх" товчоор гомдол илгээх боломжтой. Бид эдгээр нөхцөлийг зөрчсөн зарыг мэдэгдэлгүйгээр нууж, устгах, давтан зөрчсөн бүртгэлийг хаах эрхтэй.',
      ],
    },
    {
      id: 'prohibited',
      heading: '8. Хориглох үйлдэл',
      blocks: [
        {
          list: [
            'Үйлчилгээний мэдээллийг автоматаар цуглуулах (scraping), их хэмжээгээр хуулах.',
            'Утасны дугаар болон бусад мэдээллийг спам, залилан зэрэг зорилгоор ашиглах.',
            'Үйлчилгээний аюулгүй байдлыг тойрч гарах, ажиллагааг нь саатуулах.',
          ],
        },
      ],
    },
    {
      id: 'liability',
      heading: '9. Хариуцлагын хязгаар',
      blocks: [
        'Үйлчилгээг "байгаа байдлаар нь" үзүүлдэг. Бид хэрэглэгчийн байршуулсан зарын үнэн зөв байдал, хэрэглэгчдийн хооронд байгуулсан гэрээ, төлбөр, тэдгээрээс үүссэн хохирлыг хариуцахгүй. Хуулиар зөвшөөрөгдсөн хэмжээнд бид шууд бус хохирлыг хариуцахгүй.',
      ],
    },
    {
      id: 'termination',
      heading: '10. Бүртгэлийг дуусгавар болгох',
      blocks: [
        'Та бүртгэлээ хүссэн үедээ устгаж болно. Бид эдгээр нөхцөлийг зөрчсөн бүртгэлийг түдгэлзүүлэх, хаах эрхтэй.',
      ],
    },
    {
      id: 'law',
      heading: '11. Хууль ба маргаан',
      blocks: [
        'Эдгээр нөхцөлд Монгол Улсын хууль үйлчилнэ. Маргааныг эхлээд харилцан тохиролцох замаар, эс бөгөөс Монгол Улсын шүүхээр шийдвэрлэнэ.',
      ],
    },
    {
      id: 'changes',
      heading: '12. Өөрчлөлт',
      blocks: [
        'Нөхцөлийг өөрчлөх тохиолдолд энэ хуудсанд шинэчилсэн огноог тавьж, чухал өөрчлөлтийг урьдчилан мэдэгдэнэ. Өөрчлөлтийн дараа үйлчилгээг үргэлжлүүлэн ашиглах нь шинэ нөхцөлийг зөвшөөрсөнд тооцогдоно.',
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
  title: 'Terms of service',
  description: 'The terms for using the bairmair website and app.',
  legal: true,
  sections: [
    {
      id: 'accept',
      heading: '1. Accepting these terms',
      blocks: [
        `These terms govern your use of the bairmair website and app (the "service"), run by ${SITE_INFO.operator.en} ("we"). By using the service or creating an account, you accept these terms and our Privacy policy.`,
      ],
    },
    {
      id: 'service',
      heading: '2. The service',
      blocks: [
        'bairmair is a listings platform where owners and agents post apartments for sale or rent, and buyers and renters view them.',
        'We are not a party to any sale or rental agreement, we are not a broker, and we do not verify ownership, condition or price. Inspect the apartment and its documents yourself before signing anything or paying.',
        'Posting listings is currently free. If we introduce paid features, we will announce their prices and terms in advance.',
      ],
    },
    {
      id: 'account',
      heading: '3. Your account',
      blocks: [
        {
          list: [
            'You must be 18 or older to create an account.',
            'Give accurate information and verify your phone number.',
            'You are responsible for keeping your account secure; never share your sign-in code.',
            'Do not create accounts in someone else’s name or use other people’s accounts.',
          ],
        },
      ],
    },
    {
      id: 'listings',
      heading: '4. Listing rules',
      blocks: [
        'By posting a listing you confirm that:',
        {
          list: [
            'You own the apartment or are an agent authorised by the owner.',
            'The details, price and photos belong to that apartment and are accurate and current.',
            'You have the right to use the photos and text.',
            'You will not post the same apartment twice or with a misleading price.',
            'You will update the listing once the apartment is sold or rented. A published listing that is not confirmed as "Still available" every 14 days is hidden from search.',
          ],
        },
        'Not allowed: illegal, fake, misleading or offensive content, content that infringes others’ rights or contains other people’s personal data, and advertising unrelated to the listing.',
      ],
    },
    {
      id: 'scans',
      heading: '5. 3D scans and areas',
      blocks: [
        '3D models, floor plans and room areas are produced automatically from scans made with a phone’s LiDAR sensor and are approximate. The official area is the one on the property certificate. Do not rely on scanned areas for decisions.',
        'The "scanned on-site" badge means the phone was near the listing’s location during the scan; it is not a guarantee.',
      ],
    },
    {
      id: 'content',
      heading: '6. Your content',
      blocks: [
        'You keep ownership of the photos, text and scans you upload. You give us a free, non-exclusive licence to show them in the service, create shared links and previews (such as the floor-plan image shown on Facebook), and use them to promote the service. The licence ends when you delete the content.',
      ],
    },
    {
      id: 'moderation',
      heading: '7. Moderation and reports',
      blocks: [
        'Anyone can report a listing with "Report this listing". We may hide or remove listings that break these terms without notice, and close accounts that break them repeatedly.',
      ],
    },
    {
      id: 'prohibited',
      heading: '8. Prohibited use',
      blocks: [
        {
          list: [
            'Scraping or bulk copying of the service’s content.',
            'Using phone numbers or other information for spam, fraud or similar purposes.',
            'Circumventing the service’s security or disrupting its operation.',
          ],
        },
      ],
    },
    {
      id: 'liability',
      heading: '9. Limitation of liability',
      blocks: [
        'The service is provided "as is". We are not responsible for the accuracy of listings posted by users, or for agreements, payments or losses between users. To the extent the law allows, we are not liable for indirect damages.',
      ],
    },
    {
      id: 'termination',
      heading: '10. Ending your account',
      blocks: [
        'You can delete your account at any time. We may suspend or close accounts that break these terms.',
      ],
    },
    {
      id: 'law',
      heading: '11. Governing law and disputes',
      blocks: [
        'These terms are governed by the laws of Mongolia. Disputes are first settled by negotiation, otherwise by the courts of Mongolia.',
      ],
    },
    {
      id: 'changes',
      heading: '12. Changes',
      blocks: [
        'When these terms change, we update the date on this page and announce important changes in advance. Continuing to use the service after a change means you accept the new terms.',
      ],
    },
    {
      id: 'contact',
      heading: '13. Contact',
      blocks: [{ contact: true }],
    },
  ],
};

export const termsPage: Record<Locale, ContentPage> = { mn, en };
