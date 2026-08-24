// Kiosk user-facing strings, in every supported language. Care language only
// (§6) — enforced by scripts/copy-lint.mjs. English is the DEFAULT and canonical
// shape; missing keys in another locale fall back to English (deepMerge below).

export type Locale = "en" | "ko" | "es" | "zh";
export const LOCALES: { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "ko", label: "한국어" },
  { code: "es", label: "Español" },
  { code: "zh", label: "中文" },
];
export const DEFAULT_LOCALE: Locale = "en";

// ---- English (canonical) ---------------------------------------------------
const en = {
  login: {
    title: "Staff sign-in",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    error: "Sign-in failed. Please check and try again.",
    staffId: "Staff ID on duty",
    notKiosk: "This account is not a kiosk device account.",
  },
  roster: {
    title: "Who is this?",
    scanHint: "You can also scan the QR code on the name tag.",
    wrongDevice: (label: string) =>
      `This member checks in on another device (${label}). Please use the assigned device.`,
  },
  menu: {
    title: (name: string) => `${name}`,
    ppg: "Heart-rate check",
    activity: "Before & after activity",
    reaction: "Sparkle game",
    healthRecord: "Health recording (longer)",
    back: "Home",
  },
  study: {
    prepTitle: "Please sit comfortably",
    prepBody: "Rest your fingertip on the camera and relax until it finishes.",
    beltHint: "If a chest belt is ready, we'll check it together.",
    recording: "Recording…",
    site: "Where shall we check?",
    siteFinger: "Finger",
    siteFace: "Face",
    light: "Surrounding light",
    lightBright: "Bright",
    lightNormal: "Normal",
    lightDim: "Dim",
    session: "Session",
    start: "Start",
    feelTitle: "How hard is it right now?",
    feelLow: "Not hard at all",
    feelHigh: "Very hard",
    saved: "All done. Thank you!",
    skip: "Skip",
  },
  ppg: {
    rubTitle: "Please rub your hands",
    rubBody: "Warm hands read better.",
    settleTitle: "Sit and rest a moment",
    settleBody: "Please sit comfortably for 2 minutes.",
    captureTitle: "Rest your fingertip on the camera",
    captureBody: "The light turns on. Please hold still and wait.",
    computing: "Checking…",
    good: "Well done! Thank you.",
    retryTitle: "Shall we try once more?",
    retryBody: "Warm your fingertip again and give it another go.",
    retry: "Try again",
    giveUp: "Do it later",
    seconds: (s: number) => `${s}s`,
  },
  activity: {
    title: "Before & after activity",
    pickActivity: "Please choose today's activity",
    phasePre: "Before",
    phasePost: "After",
    phaseRecovery: "30 min later",
    howNow: "How are you feeling now?",
    energyNow: "How's your energy now?",
    painNow: "Any aches or pain?",
    done: "All done. Thank you!",
  },
  reaction: {
    title: "Sparkle game",
    explain: "When the screen turns green, tap right away!",
    wait: "Wait…",
    tap: "Tap now!",
    tooSoon: "Just a little longer!",
    done: "Well done! Did you enjoy it?",
    start: "Start",
    round: (n: number, total: number) => `${n} / ${total}`,
  },
  faces: {
    mood: ["Very hard", "Hard", "Okay", "Good", "Very good"],
    energy: ["No energy", "A little low", "Okay", "Energetic", "Very energetic"],
    pain: ["A lot of pain", "In pain", "A little pain", "Fine", "Very good"],
  },
  common: { loading: "One moment…", error: "Something went wrong. Please tell a staff member." },
};

export type Copy = typeof en;

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...a: any[]) => any
    ? T[K]
    : T[K] extends readonly any[]
    ? T[K]
    : T[K] extends object
    ? DeepPartial<T[K]>
    : T[K];
};

// ---- 한국어 (complete) -----------------------------------------------------
const ko: DeepPartial<Copy> = {
  login: {
    title: "직원 로그인",
    email: "이메일",
    password: "비밀번호",
    signIn: "로그인",
    error: "로그인에 실패했어요. 다시 확인해 주세요.",
    staffId: "담당 직원 ID",
    notKiosk: "이 계정은 키오스크 기기 계정이 아니에요.",
  },
  roster: {
    title: "어느 분이세요?",
    scanHint: "이름표의 QR 코드를 대주셔도 돼요",
    wrongDevice: (label: string) =>
      `이 어르신은 다른 기기(${label})에서 확인해요. 정해진 기기를 사용해 주세요.`,
  },
  menu: {
    title: (name: string) => `${name}님`,
    ppg: "심장 박동 확인",
    activity: "활동 전후 확인",
    reaction: "반짝반짝 게임",
    healthRecord: "건강 기록 (긴 확인)",
    back: "처음으로",
  },
  study: {
    prepTitle: "잠시 편안히 앉아 계세요",
    prepBody: "손가락을 카메라에 살짝 대고, 끝날 때까지 편안하게 기다려 주세요.",
    beltHint: "가슴 벨트도 함께 준비되면 같이 확인해요.",
    recording: "기록하고 있어요…",
    site: "어디로 확인할까요?",
    siteFinger: "손가락",
    siteFace: "얼굴",
    light: "주변 밝기",
    lightBright: "밝음",
    lightNormal: "보통",
    lightDim: "어두움",
    session: "회차",
    start: "시작",
    feelTitle: "지금 얼마나 힘드세요?",
    feelLow: "하나도 안 힘들어요",
    feelHigh: "아주 많이 힘들어요",
    saved: "다 됐어요. 고맙습니다!",
    skip: "건너뛰기",
  },
  ppg: {
    rubTitle: "손을 비벼주세요",
    rubBody: "손이 따뜻해야 잘 보여요.",
    settleTitle: "편안히 앉아서 기다려요",
    settleBody: "2분 동안 편안하게 앉아 계세요.",
    captureTitle: "손가락을 카메라에 살짝 대주세요",
    captureBody: "불빛이 켜져요. 움직이지 않고 기다려 주세요.",
    computing: "확인하고 있어요…",
    good: "잘 됐어요! 고맙습니다.",
    retryTitle: "다시 한번 해볼까요?",
    retryBody: "손가락을 다시 따뜻하게 하고 한번 더 해주세요.",
    retry: "다시 하기",
    giveUp: "다음에 하기",
    seconds: (s: number) => `${s}초`,
  },
  activity: {
    title: "활동 전후 확인",
    pickActivity: "오늘의 활동을 골라주세요",
    phasePre: "활동 전",
    phasePost: "활동 후",
    phaseRecovery: "30분 뒤",
    howNow: "지금 기분이 어떠세요?",
    energyNow: "지금 힘이 어떠세요?",
    painNow: "아프신 데 있나요?",
    done: "다 됐어요. 고맙습니다!",
  },
  reaction: {
    title: "반짝반짝 게임",
    explain: "화면이 초록색이 되면 바로 눌러주세요!",
    wait: "기다려요…",
    tap: "지금 눌러요!",
    tooSoon: "조금만 더 기다려요!",
    done: "참 잘하셨어요! 재미있으셨나요?",
    start: "시작",
    round: (n: number, total: number) => `${n} / ${total}`,
  },
  faces: {
    mood: ["아주 힘들어요", "힘들어요", "보통이에요", "좋아요", "아주 좋아요"],
    energy: ["기운이 없어요", "조금 없어요", "보통이에요", "기운나요", "아주 기운나요"],
    pain: ["많이 아파요", "아파요", "조금 아파요", "괜찮아요", "아주 좋아요"],
  },
  common: { loading: "잠시만요…", error: "문제가 생겼어요. 직원에게 알려주세요." },
};

// ---- Español ---------------------------------------------------------------
const es: DeepPartial<Copy> = {
  login: {
    title: "Acceso del personal",
    email: "Correo",
    password: "Contraseña",
    signIn: "Entrar",
    error: "No se pudo entrar. Verifique e inténtelo de nuevo.",
    staffId: "ID del personal a cargo",
    notKiosk: "Esta cuenta no es de un dispositivo kiosco.",
  },
  roster: {
    title: "¿Quién es usted?",
    scanHint: "También puede escanear el código QR de la etiqueta.",
    wrongDevice: (label: string) =>
      `Este miembro se registra en otro dispositivo (${label}). Use el dispositivo asignado.`,
  },
  menu: {
    title: (name: string) => `${name}`,
    ppg: "Chequeo del ritmo cardíaco",
    activity: "Antes y después de la actividad",
    reaction: "Juego de destellos",
    healthRecord: "Registro de salud (más largo)",
    back: "Inicio",
  },
  study: {
    prepTitle: "Siéntese cómodamente",
    prepBody: "Apoye la yema del dedo en la cámara y relájese hasta que termine.",
    beltHint: "Si la banda de pecho está lista, la revisamos juntos.",
    recording: "Grabando…",
    site: "¿Dónde revisamos?",
    siteFinger: "Dedo",
    siteFace: "Cara",
    light: "Luz del entorno",
    lightBright: "Brillante",
    lightNormal: "Normal",
    lightDim: "Tenue",
    session: "Sesión",
    start: "Empezar",
    feelTitle: "¿Qué tan difícil se siente ahora?",
    feelLow: "Nada difícil",
    feelHigh: "Muy difícil",
    saved: "Listo. ¡Gracias!",
    skip: "Omitir",
  },
  ppg: {
    rubTitle: "Frótese las manos",
    rubBody: "Las manos tibias se leen mejor.",
    settleTitle: "Siéntese y descanse un momento",
    settleBody: "Siéntese cómodamente por 2 minutos.",
    captureTitle: "Apoye la yema del dedo en la cámara",
    captureBody: "La luz se enciende. No se mueva y espere.",
    computing: "Revisando…",
    good: "¡Bien hecho! Gracias.",
    retryTitle: "¿Lo intentamos otra vez?",
    retryBody: "Caliente la yema de nuevo e inténtelo una vez más.",
    retry: "Reintentar",
    giveUp: "Hacerlo luego",
    seconds: (s: number) => `${s}s`,
  },
  activity: {
    title: "Antes y después de la actividad",
    pickActivity: "Elija la actividad de hoy",
    phasePre: "Antes",
    phasePost: "Después",
    phaseRecovery: "30 min después",
    howNow: "¿Cómo se siente ahora?",
    energyNow: "¿Cómo está su energía ahora?",
    painNow: "¿Le duele algo?",
    done: "Listo. ¡Gracias!",
  },
  reaction: {
    title: "Juego de destellos",
    explain: "Cuando la pantalla se ponga verde, ¡toque enseguida!",
    wait: "Espere…",
    tap: "¡Toque ahora!",
    tooSoon: "¡Un poquito más!",
    done: "¡Bien hecho! ¿Le gustó?",
    start: "Empezar",
    round: (n: number, total: number) => `${n} / ${total}`,
  },
  faces: {
    mood: ["Muy mal", "Mal", "Regular", "Bien", "Muy bien"],
    energy: ["Sin energía", "Algo baja", "Regular", "Con energía", "Con mucha energía"],
    pain: ["Mucho dolor", "Con dolor", "Poco dolor", "Bien", "Muy bien"],
  },
  common: { loading: "Un momento…", error: "Algo salió mal. Avise a un miembro del personal." },
};

// ---- 中文 ------------------------------------------------------------------
const zh: DeepPartial<Copy> = {
  login: {
    title: "员工登录",
    email: "邮箱",
    password: "密码",
    signIn: "登录",
    error: "登录失败，请检查后重试。",
    staffId: "值班员工ID",
    notKiosk: "此账号不是自助机设备账号。",
  },
  roster: {
    title: "请问您是哪位？",
    scanHint: "也可以扫描名牌上的二维码。",
    wrongDevice: (label: string) => `这位长者在另一台设备（${label}）上确认。请使用指定设备。`,
  },
  menu: {
    title: (name: string) => `${name}`,
    ppg: "心率确认",
    activity: "活动前后确认",
    reaction: "闪光小游戏",
    healthRecord: "健康记录（较长）",
    back: "返回首页",
  },
  study: {
    prepTitle: "请安静地坐一会儿",
    prepBody: "把手指轻轻放在摄像头上，放松等待直到结束。",
    beltHint: "如果胸带也准备好了，就一起确认。",
    recording: "正在记录…",
    site: "在哪里确认？",
    siteFinger: "手指",
    siteFace: "面部",
    light: "周围亮度",
    lightBright: "明亮",
    lightNormal: "一般",
    lightDim: "昏暗",
    session: "次数",
    start: "开始",
    feelTitle: "现在感觉有多累？",
    feelLow: "一点也不累",
    feelHigh: "非常累",
    saved: "完成了，谢谢！",
    skip: "跳过",
  },
  ppg: {
    rubTitle: "请搓一搓手",
    rubBody: "手暖和一些更容易读取。",
    settleTitle: "请坐下休息一会儿",
    settleBody: "请安静地坐2分钟。",
    captureTitle: "把手指轻轻放在摄像头上",
    captureBody: "灯会亮起。请不要动，稍等片刻。",
    computing: "正在确认…",
    good: "很好！谢谢。",
    retryTitle: "再试一次好吗？",
    retryBody: "把手指再搓暖一点，再试一次。",
    retry: "再试一次",
    giveUp: "下次再做",
    seconds: (s: number) => `${s}秒`,
  },
  activity: {
    title: "活动前后确认",
    pickActivity: "请选择今天的活动",
    phasePre: "活动前",
    phasePost: "活动后",
    phaseRecovery: "30分钟后",
    howNow: "现在感觉怎么样？",
    energyNow: "现在精神怎么样？",
    painNow: "有不舒服的地方吗？",
    done: "完成了，谢谢！",
  },
  reaction: {
    title: "闪光小游戏",
    explain: "屏幕变绿时请马上点！",
    wait: "请等待…",
    tap: "现在点！",
    tooSoon: "再等一会儿！",
    done: "做得真好！玩得开心吗？",
    start: "开始",
    round: (n: number, total: number) => `${n} / ${total}`,
  },
  faces: {
    mood: ["很难受", "难受", "一般", "不错", "很好"],
    energy: ["没力气", "有点累", "一般", "有精神", "很有精神"],
    pain: ["很疼", "有点疼", "轻微疼", "还好", "很好"],
  },
  common: { loading: "请稍等…", error: "出错了，请告诉工作人员。" },
};

// Missing keys in any locale fall back to English.
function deepMerge<T>(base: T, over: any): T {
  if (over == null) return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const k of Object.keys(over)) {
    const b: any = (base as any)?.[k];
    const o: any = over[k];
    out[k] =
      o && b && typeof o === "object" && !Array.isArray(o) && typeof o !== "function"
        ? deepMerge(b, o)
        : o;
  }
  return out;
}

export const DICT: Record<Locale, Copy> = {
  en,
  ko: deepMerge(en, ko),
  es: deepMerge(en, es),
  zh: deepMerge(en, zh),
};
