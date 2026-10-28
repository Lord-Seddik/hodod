// Official calculation methods.
// name: display name · fajr: Fajr angle (° below horizon)
// isha: Isha angle (° below horizon), OR ishaMin: fixed minutes after Maghrib
// ishaMinRamadan: minutes after Maghrib during Ramadan (Umm al-Qura)
// adjust: official fixed offsets in minutes (sunrise, dhuhr, asr, maghrib) that the
//   authority adds on top of the astronomy (e.g. Diyanet's temkin), per adhan-js / Aladhan
export const METHODS = {
  MWL:     { name: 'رابطة العالم الإسلامي', fajr: 18, isha: 17 },
  UQ:      { name: 'أم القرى، مكة', fajr: 18.5, ishaMin: 90, ishaMinRamadan: 120 },
  EGYPT:   { name: 'الهيئة المصرية العامة للمساحة', fajr: 19.5, isha: 17.5 },
  ISNA:    { name: 'الجمعية الإسلامية لأمريكا الشمالية', fajr: 15, isha: 15 },
  KARACHI: { name: 'جامعة العلوم الإسلامية، كراتشي', fajr: 18, isha: 18 },
  DIYANET: { name: 'رئاسة الشؤون الدينية التركية', fajr: 18, isha: 17, adjust: { sunrise: -7, dhuhr: 5, asr: 4, maghrib: 7 } },
  GULF:    { name: 'منطقة الخليج', fajr: 19.5, ishaMin: 90 },
  KUWAIT:  { name: 'الكويت', fajr: 18, isha: 17.5 },
  QATAR:   { name: 'قطر', fajr: 18, ishaMin: 90 },
  DUBAI:   { name: 'دبي', fajr: 18.2, isha: 18.2, adjust: { sunrise: -3, dhuhr: 3, asr: 3, maghrib: 3 } },
  JORDAN:  { name: 'الأردن', fajr: 18, isha: 18, adjust: { maghrib: 5 } },
  MOROCCO: { name: 'المغرب، وزارة الأوقاف', fajr: 19, isha: 17, adjust: { dhuhr: 5, maghrib: 5 } },
  ALGERIA: { name: 'الجزائر', fajr: 18, isha: 17 },
  TUNISIA: { name: 'تونس', fajr: 18, isha: 18 },
  SEA:     { name: 'سنغافورة وماليزيا وإندونيسيا', fajr: 20, isha: 18 },
  RUSSIA:  { name: 'الإدارة الدينية لمسلمي روسيا', fajr: 16, isha: 15 },
  UOIF:    { name: 'اتحاد المنظمات الإسلامية بفرنسا', fajr: 12, isha: 12 },
  CUSTOM:  { name: 'زوايا مخصّصة', fajr: 18, isha: 17 },
};
