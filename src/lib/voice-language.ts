export type VoiceLanguage = "en-IN" | "hi-IN";
export const VOICE_LANGUAGES = ["en-IN", "hi-IN"] as const;
export function parseVoiceLanguage(value: unknown): VoiceLanguage {
  if (value == null || value === "") return "en-IN";
  if (value === "en-IN" || value === "hi-IN") return value;
  throw new Error("Choose English (en-IN) or Hindi (hi-IN).");
}

/** Normalize only known observation terms for parsing; retain the original answer in the record. */
export function normalizeObservation(text: string): string {
  const digits = "०१२३४५६७८९";
  let normalized = text.replace(/[०-९]/g, digit => String(digits.indexOf(digit)));
  const words: [RegExp,string][] = [
    [/टखनों|टखने|टखना/g," ankle "], [/पिंडलियों|पिंडली/g," shin "], [/घुटनों|घुटने|घुटना/g," knee "], [/कमर/g," waist "],
    [/सेंटीमीटर|सेंटिमिटर|सेमी/g," cm "], [/पता नहीं|नहीं पता|अनजान|नहीं बता सकता|नहीं बता सकती/g," unknown "],
    [/नहीं बह रहा|बह नहीं रहा|स्थिर पानी/g," still water "], [/तेज़ बहाव|तेज बहाव|तेज़ धारा|तेज धारा/g," fast current "], [/पानी बह रहा/g," flowing water "],
    [/खुला नाला|खुली नाली/g," open drain "], [/खुला मैनहोल|मैनहोल खुला/g," open manhole "],
    [/सड़क दिखाई नहीं|सड़क नहीं दिख|सड़क छिपी/g," road not visible "], [/सड़क दिखाई|सड़क दिख/g," visible road "],
    [/अंडरपास/g," underpass "], [/राजमार्ग|हाईवे/g," highway "], [/सड़क/g," road "],
    [/स्कूटर/g," scooter "], [/मोटरसाइकिल|मोटर साइकिल|बाइक/g," motorcycle "], [/कारें|कार/g," car "], [/ट्रक/g," truck "], [/बसें|बस/g," bus "],
  ];
  for (const [pattern,replacement] of words) normalized = normalized.replace(pattern,replacement);
  return normalized;
}
