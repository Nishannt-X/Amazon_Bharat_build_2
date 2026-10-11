import type { VoiceLanguage } from "./voice-language";
export interface McqOption {
  id: string;
  label: string;
  depthMm?: number | null;
  confidenceBonus: number;
  movingWater?: boolean | null;
  roadSurfaceVisible?: boolean | null;
  hazard?: string | null;
}
export interface QuantitativeQuestion {
  question: string;
  category: "depth_landmark" | "body_height" | "traffic_reference" | "road_hazards";
  options: McqOption[];
  turnIndex: number;
}

/** Qualitative landmarks never carry a universal millimetre conversion. */
export function contextQuestion(turnIndex: number, language: VoiceLanguage = "en-IN"): QuantitativeQuestion | null {
  const choice = (id: string, label: string): McqOption => ({id,label,depthMm:null,confidenceBonus:0});
  const questions: QuantitativeQuestion[] = [
    {
      turnIndex:0,category:"depth_landmark",
      question:"Only if you are already safely standing there: does the water reach your ankle, shin, knee or waist? Do not enter water to check. Otherwise choose cannot judge.",
      options:[choice("ankle","Water reaches my ankles"),choice("shin","Water reaches my shins"),choice("knee","Water reaches my knees"),choice("waist","Water reaches my waist"),choice("unknown","Cannot judge safely / not standing in that water")],
    },
    {
      turnIndex:1,category:"body_height",
      question:"If that was your own body reference, what is your height in centimetres? Type it, or say unknown. Height only gives a rough body-proportion estimate, not a measured depth.",
      options:[],
    },
    {
      turnIndex:2,category:"traffic_reference",
      question:"What traffic can you see? If you know the model or bus operator, type it and describe where water reaches its wheel. Wheel hubs have no universal height.",
      options:[choice("car","Cars visible"),choice("scooter","Scooters visible"),choice("motorcycle","Motorcycles visible"),choice("bus","Buses visible; model unknown"),choice("truck","Trucks visible"),choice("unknown","Traffic unknown / no clear reference")],
    },
    {
      turnIndex:3,category:"road_hazards",
      question:"From a safe position, describe water movement and any visible road hazards. You can also type the road type and whether you can see its surface.",
      options:[{...choice("still","Still water / not flowing"),movingWater:false},{...choice("flowing","Water is flowing; speed unknown"),movingWater:true},{...choice("fast","Fast current / rushing water"),movingWater:true,hazard:"strong current"},{...choice("drain","Open drain or missing manhole visible"),hazard:"open drain"},{...choice("hidden","Road surface is hidden by water"),roadSurfaceVisible:false},choice("unknown","Cannot judge movement or hazards safely")],
    },
  ];
  const question = questions[turnIndex];
  if (!question) return null;
  if (language === "en-IN") return question;
  const hindiQuestions = [
    "केवल तभी बताएं जब आप पहले से सुरक्षित जगह पर खड़े हों: पानी टखनों, पिंडलियों, घुटनों या कमर तक है? जांचने के लिए पानी में न उतरें। नहीं बता सकते तो वही चुनें।",
    "यदि पिछला उत्तर आपके अपने शरीर के बारे में था, तो आपकी लंबाई सेंटीमीटर में कितनी है? लिखें या बताएं कि पता नहीं। इससे केवल मोटा अनुमान मिलता है, मापी हुई गहराई नहीं।",
    "कौन से वाहन दिखाई दे रहे हैं? मॉडल या बस संचालक पता हो तो लिखें, और बताएं पानी पहिये के किस हिस्से तक है। सभी वाहनों के व्हील हब की ऊंचाई एक जैसी नहीं होती।",
    "सुरक्षित जगह से पानी का बहाव और दिखाई दे रहे खतरे बताएं। सड़क का प्रकार और उसकी सतह दिखाई देती है या नहीं, यह भी लिख सकते हैं।",
  ];
  const labels: Record<string,string>[] = [
    {ankle:"पानी मेरे टखनों तक है",shin:"पानी मेरी पिंडलियों तक है",knee:"पानी मेरे घुटनों तक है",waist:"पानी मेरी कमर तक है",unknown:"सुरक्षित जगह से नहीं बता सकता / उस पानी में खड़ा नहीं हूं"},
    {},
    {car:"कारें दिखाई दे रही हैं",scooter:"स्कूटर दिखाई दे रहे हैं",motorcycle:"मोटरसाइकिल दिखाई दे रही हैं",bus:"बसें दिखाई दे रही हैं; मॉडल पता नहीं",truck:"ट्रक दिखाई दे रहे हैं",unknown:"वाहन पता नहीं / साफ संदर्भ नहीं दिख रहा"},
    {still:"पानी स्थिर है / बह नहीं रहा",flowing:"पानी बह रहा है; गति पता नहीं",fast:"तेज़ बहाव / तेज़ धारा",drain:"खुला नाला या खुला मैनहोल दिखाई दे रहा है",hidden:"पानी से सड़क की सतह छिपी है",unknown:"सुरक्षित जगह से बहाव या खतरे नहीं बता सकता"},
  ];
  return {...question,question:hindiQuestions[turnIndex],options:question.options.map(option=>({...option,label:labels[turnIndex][option.id] ?? option.label}))};
}

/** Bedrock may tailor wording, but cannot invent landmark dimensions or option metrics. */
export function validateContextQuestion(value: unknown, canonical: QuantitativeQuestion): QuantitativeQuestion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return canonical;
  const data = value as Record<string,unknown>;
  if (typeof data.question !== "string" || data.question.length < 10 || data.question.length > 450 || /[0-9०-९]|\b(?:mm|millimet(?:er|re)s?|inches?|feet)\b/i.test(data.question)) return canonical;
  if (data.category !== canonical.category) return canonical;
  // Options always come from the server; reject fabricated quantitative choices.
  if (Array.isArray(data.options) && data.options.some(option => {
    if (!option || typeof option !== "object") return true;
    const candidate = option as Record<string,unknown>;
    return candidate.depthMm != null || typeof candidate.label !== "string" || /[0-9०-९]/.test(candidate.label);
  })) return canonical;
  return {...canonical,question:data.question.trim()};
}
