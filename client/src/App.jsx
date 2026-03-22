import { useEffect, useRef, useState } from "react";

const STORAGE_KEYS = {
  studentName: "trumanConcierge.studentName",
  calendarConnected: "trumanConcierge.calendarConnected",
  onboardingComplete: "trumanConcierge.onboardingComplete",
};

const CREATE_CONFIRMATION_PATTERN =
  /\b(yes|yeah|yep|create|tap create|create it|do it|go ahead|confirm|book it|schedule it|add it|make it)\b/i;

const PLANNER_EVENT_MARKER = "[Truman Concierge Planner]";

const QUICK_PROMPTS = [
  "What is going on today?",
  "What fits in my schedule?",
  "What are the rec classes and hours today?",
  "Are there any athletics events tomorrow?",
];

const PLANNER_STEPS = [
  {
    key: "preferredDiningHalls",
    label: "Dining",
    question: "Which dining hall should I prioritize this week?",
    help: "I'll use this first when I place meal reminders around your classes.",
    quickChoices: ["Ryle", "Missouri", "Both"],
    inputMode: "text",
    placeholder: "Ryle, Missouri, or both",
  },
  {
    key: "favoriteFoods",
    label: "Food",
    question: "What foods should I look for this week?",
    help: "You can list favorites and I'll use them when I scan the menu.",
    quickChoices: ["Chicken", "Pasta", "Vegetarian", "Breakfast"],
    inputMode: "text",
    placeholder: "pasta, chicken, breakfast sandwiches",
  },
  {
    key: "favoriteEventTypes",
    label: "Events",
    question: "What kinds of events do you actually want this week?",
    help: "I'll rank campus events around these preferences instead of showing everything.",
    quickChoices: ["Arts", "Wellness", "Athletics", "Social", "Academic"],
    inputMode: "text",
    placeholder: "arts, wellness, athletics",
  },
  {
    key: "preferredRecActivities",
    label: "Rec",
    question: "What kind of Rec time do you want in your week?",
    help: "Pick your main workout style and I'll fit it into open windows.",
    quickChoices: ["Weights", "Cardio", "Open gym", "Recovery"],
    inputMode: "text",
    placeholder: "weights, cardio, open gym",
  },
  {
    key: "wantsRecClasses",
    label: "Rec Classes",
    question: "Should I mix scheduled Rec classes into your week too?",
    help: "If yes, I'll blend classes like Yoga or GLOWGA with your own workouts.",
    quickChoices: ["Yes", "No"],
    inputMode: "choice-only",
  },
  {
    key: "recSessionsPerWeek",
    label: "Rec Frequency",
    question: "How many Rec sessions should I fit into this week?",
    help: "This tells me how many workout or Rec class slots to protect.",
    quickChoices: ["1", "2", "3", "4", "5"],
    inputMode: "choice-only",
  },
  {
    key: "preferredRecTime",
    label: "Rec Time",
    question: "When should I look for Rec time?",
    help: "I'll prioritize open windows that match this time of day.",
    quickChoices: ["Morning", "After class", "Evening"],
    inputMode: "choice-only",
  },
  {
    key: "preferredRecCrowd",
    label: "Crowd",
    question: "Do you want quieter Rec windows or more energetic ones?",
    help: "I'll use live and saved Rec crowd patterns to steer your workout windows.",
    quickChoices: ["Quiet", "Balanced", "Lively"],
    inputMode: "choice-only",
  },
  {
    key: "studyHoursPerWeek",
    label: "Study",
    question: "How many study hours should I protect this week?",
    help: "These become actual study blocks around your classes and meetings.",
    quickChoices: ["2", "4", "6", "8"],
    inputMode: "choice-only",
  },
  {
    key: "preferredStudyWindow",
    label: "Study Window",
    question: "When do you study best?",
    help: "I'll place study sessions where you're most likely to keep them.",
    quickChoices: ["Between classes", "Afternoons", "Evenings", "Weekends"],
    inputMode: "choice-only",
  },
  {
    key: "hardestCourses",
    label: "Courses",
    question: "Which courses need the most attention this week?",
    help: "I'll pull likely classes from your calendar when I can, and you can still type your own below.",
    quickChoices: [],
    inputMode: "text",
    placeholder: "CS 180, MATH 198",
  },
  {
    key: "weeklyFocus",
    label: "Focus",
    question: "What should this week feel like?",
    help: "I'll tune the week to feel more balanced, productive, low-stress, or fun.",
    quickChoices: ["Balance", "Productive", "Low stress", "Fun"],
    inputMode: "choice-only",
  },
  {
    key: "wantsSurpriseEvents",
    label: "Surprise",
    question: "Do you want one surprise event outside your usual routine?",
    help: "This lets me add one Truman pick you normally would not choose.",
    quickChoices: ["Yes", "No"],
    inputMode: "choice-only",
  },
];

function getInitialDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function getCurrentClockLabel() {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function addDaysToDateKey(dateKey, days) {
  const base = new Date(`${dateKey}T12:00:00`);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function formatDateLabel(dateKey) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dateKey}T12:00:00`));
}

function formatWeekRangeLabel(startDateKey) {
  const endDateKey = addDaysToDateKey(startDateKey, 6);
  const start = new Date(`${startDateKey}T12:00:00`);
  const end = new Date(`${endDateKey}T12:00:00`);

  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();

  const startLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(start);

  const endLabel = new Intl.DateTimeFormat("en-US", {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  }).format(end);

  return `${startLabel} - ${endLabel}`;
}

function splitCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getStoredBoolean(key) {
  return localStorage.getItem(key) === "true";
}

function getInitialPreferences() {
  return {
    preferredDiningHalls: [],
    favoriteFoods: [],
    favoriteEventTypes: [],
    preferredRecActivities: [],
    recSessionsPerWeek: 0,
    preferredRecTime: "",
    preferredRecCrowd: "",
    wantsRecClasses: null,
    weeklyFocus: "",
    studyHoursPerWeek: 0,
    preferredStudyWindow: "",
    hardestCourses: [],
    wantsSurpriseEvents: null,
  };
}

function normalizePreferences(preferences = {}) {
  return {
    ...getInitialPreferences(),
    ...preferences,
    preferredDiningHalls: preferences.preferredDiningHalls ?? [],
    favoriteFoods: preferences.favoriteFoods ?? [],
    favoriteEventTypes: preferences.favoriteEventTypes ?? [],
    preferredRecActivities: preferences.preferredRecActivities ?? [],
    recSessionsPerWeek: Number(preferences.recSessionsPerWeek ?? 0) || 0,
    hardestCourses: preferences.hardestCourses ?? [],
  };
}

function getCourseQuickChoices(courseOptions = [], selectedCourses = []) {
  const detectedCourses = (courseOptions ?? [])
    .map((item) => (typeof item === "string" ? item : item?.course))
    .filter(Boolean);

  return [...new Set([...(detectedCourses ?? []), ...(selectedCourses ?? [])])].slice(0, 6);
}

function getStepValue(step, preferences) {
  const value = preferences?.[step.key];

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value ?? "");
}

function applyStepValue(step, rawValue, previousPreferences) {
  const value = String(rawValue ?? "").trim();
  const next = { ...previousPreferences };

  switch (step.key) {
    case "preferredDiningHalls":
      next.preferredDiningHalls =
        /^both$/i.test(value) ? ["ryle", "missouri"] : splitCsv(value.toLowerCase());
      break;
    case "favoriteFoods":
      next.favoriteFoods = splitCsv(value);
      break;
    case "favoriteEventTypes":
      next.favoriteEventTypes = splitCsv(value.toLowerCase());
      break;
    case "preferredRecActivities":
      next.preferredRecActivities = splitCsv(value.toLowerCase());
      break;
    case "wantsRecClasses":
      next.wantsRecClasses =
        /^yes$/i.test(value) ? true : /^no$/i.test(value) ? false : null;
      break;
    case "recSessionsPerWeek":
      next.recSessionsPerWeek = Number(value) || 0;
      break;
    case "preferredRecTime":
      next.preferredRecTime = value.toLowerCase();
      break;
    case "preferredRecCrowd":
      next.preferredRecCrowd = value.toLowerCase();
      break;
    case "studyHoursPerWeek":
      next.studyHoursPerWeek = Number(value) || 0;
      break;
    case "preferredStudyWindow":
      next.preferredStudyWindow = value.toLowerCase();
      break;
    case "hardestCourses":
      next.hardestCourses = splitCsv(value);
      break;
    case "weeklyFocus":
      next.weeklyFocus = value.toLowerCase();
      break;
    case "wantsSurpriseEvents":
      next.wantsSurpriseEvents =
        /^yes$/i.test(value) ? true : /^no$/i.test(value) ? false : null;
      break;
    default:
      break;
  }

  return next;
}

function toLocalInputValue(isoString) {
  if (!isoString) {
    return "";
  }

  const date = new Date(isoString);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function buildMealPayload(item) {
  return {
    summary: `${item.meal[0].toUpperCase()}${item.meal.slice(1)} at ${item.hall}`,
    description: `${PLANNER_EVENT_MARKER} ${item.note} Suggested ${item.meal} options: ${item.items.join(", ")}`,
    location: item.hall,
    startDateTime: item.startsAt,
    endDateTime: item.endsAt,
  };
}

function buildEventPayload(item) {
  return {
    summary: item.summary || item.title,
    description: item.note
      ? `${PLANNER_EVENT_MARKER} ${item.note}`
      : `${PLANNER_EVENT_MARKER} Planned from Truman Campus Concierge.`,
    location: item.location || "",
    startDateTime: item.startsAt,
    endDateTime: item.endsAt,
  };
}

function buildWeekPlanCalendarItems(plan) {
  const items = [];

  for (const meal of plan?.mealSuggestions ?? []) {
    if (meal.startsAt && meal.endsAt) {
      items.push(buildMealPayload(meal));
    }
  }

  for (const event of plan?.eventSuggestions ?? []) {
    if (event.startsAt && event.endsAt) {
      items.push(buildEventPayload(event));
    }
  }

  for (const recItem of plan?.recSuggestions ?? []) {
    if (recItem.startsAt && recItem.endsAt) {
      items.push(buildEventPayload(recItem));
    }
  }

  if (plan?.surprisePick?.startsAt && plan?.surprisePick?.endsAt) {
    items.push(buildEventPayload(plan.surprisePick));
  }

  for (const studyItem of plan?.studySuggestions ?? []) {
    if (studyItem.startsAt && studyItem.endsAt) {
      items.push({
        summary: studyItem.course
          ? `Study block for ${studyItem.course}`
          : "Study block",
        description: studyItem.note
          ? `${PLANNER_EVENT_MARKER} ${studyItem.note}`
          : `${PLANNER_EVENT_MARKER} Planned from Truman Campus Concierge.`,
        location: studyItem.location || "Pickler Memorial Library",
        startDateTime: studyItem.startsAt,
        endDateTime: studyItem.endsAt,
      });
    }
  }

  return items;
}

function App() {
  const speechRecognition =
    typeof window !== "undefined"
      ? window.SpeechRecognition || window.webkitSpeechRecognition || null
      : null;

  const [studentName, setStudentName] = useState(
    localStorage.getItem(STORAGE_KEYS.studentName) ?? "",
  );
  const [calendarConnected, setCalendarConnected] = useState(
    getStoredBoolean(STORAGE_KEYS.calendarConnected),
  );
  const [onboardingComplete, setOnboardingComplete] = useState(
    getStoredBoolean(STORAGE_KEYS.onboardingComplete),
  );
  const [userId, setUserId] = useState("demo");
  const [activeTab, setActiveTab] = useState("talk");
  const [profileOpen, setProfileOpen] = useState(false);
  const [clockLabel, setClockLabel] = useState(getCurrentClockLabel);
  const [date, setDate] = useState(getInitialDate);
  const [question, setQuestion] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [conversationId, setConversationId] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [latestAnswer, setLatestAnswer] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("Ready when you are.");
  const [isListening, setIsListening] = useState(false);
  const [listeningTab, setListeningTab] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [meetingDraft, setMeetingDraft] = useState(null);
  const [meetingForm, setMeetingForm] = useState({
    title: "",
    location: "",
    description: "",
    startDateTime: "",
    endDateTime: "",
    readyToCreate: false,
    requested: false,
  });
  const [meetingStatus, setMeetingStatus] = useState(
    "If the assistant drafts a meeting, it will appear here.",
  );
  const [meetingLink, setMeetingLink] = useState("");
  const [plannerPreferences, setPlannerPreferences] = useState(getInitialPreferences);
  const [plannerStepIndex, setPlannerStepIndex] = useState(0);
  const [plannerStepInput, setPlannerStepInput] = useState("");
  const [showPlannerJourney, setShowPlannerJourney] = useState(true);
  const [plannerSummary, setPlannerSummary] = useState(
    "Walk through the planner questions, then I'll build a weekly plan around your Google Calendar.",
  );
  const [plannerPlan, setPlannerPlan] = useState(null);
  const [plannerCourseOptions, setPlannerCourseOptions] = useState([]);
  const [plannerRevealIndex, setPlannerRevealIndex] = useState(-1);
  const [isBuildingPlan, setIsBuildingPlan] = useState(false);
  const [isSavingWholePlan, setIsSavingWholePlan] = useState(false);
  const [savingItemKey, setSavingItemKey] = useState("");
  const recognitionRef = useRef(null);
  const isListeningRef = useRef(false);
  const voiceSessionRef = useRef(0);
  const lastTranscriptRef = useRef("");
  const conciergeRequestRef = useRef(null);
  const voiceConversationModeRef = useRef(false);

  const [isRealtimeActive, setIsRealtimeActive] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState("");
  const [realtimeTranscript, setRealtimeTranscript] = useState([]);
  const realtimeWsRef = useRef(null);
  const realtimeAudioCtxRef = useRef(null);
  const realtimeWorkletRef = useRef(null);
  const realtimeStreamRef = useRef(null);
  const realtimeNextPlayTimeRef = useRef(0);
  const firstName = studentName.trim().split(/\s+/)[0] || "Truman";
  const profileInitial = firstName[0]?.toUpperCase() || "T";
  const todayDate = getInitialDate();
  const talkDateLabel = date === todayDate ? `Today · ${formatDateLabel(date)}` : formatDateLabel(date);
  const weekRangeLabel = formatWeekRangeLabel(date);
  const plannerStep = PLANNER_STEPS[plannerStepIndex];
  const plannerStepChoices =
    plannerStep.key === "hardestCourses"
      ? getCourseQuickChoices(
          plannerPlan?.inferredCourses?.length
            ? plannerPlan.inferredCourses
            : plannerCourseOptions,
          plannerPreferences.hardestCourses,
        )
      : plannerStep.quickChoices;
  const plannerSections = [
    {
      title: "Meals",
      items: plannerPlan?.mealSuggestions ?? [],
      render: (item) => ({
        title: `${item.date} ${item.meal} at ${item.hall}`,
        subtitle: item.displayTime || "Meal window to be chosen",
        body: [item.items.join(", "), item.note].filter(Boolean),
        payload:
          item.startsAt && item.endsAt
            ? { ...buildMealPayload(item), label: "Add Meal Reminder" }
            : null,
      }),
    },
    {
      title: "Events",
      items: plannerPlan?.eventSuggestions ?? [],
      render: (item) => ({
        title: `${item.date} ${item.summary}`,
        subtitle: item.displayTime,
        body: [item.location || "Location TBD", item.note].filter(Boolean),
        payload:
          item.startsAt && item.endsAt
            ? { ...buildEventPayload(item), label: "Add Event" }
            : null,
      }),
    },
    {
      title: "Rec + Surprise",
      items: [
        ...(plannerPlan?.recSuggestions ?? []),
        ...(plannerPlan?.surprisePick
          ? [
              {
                ...plannerPlan.surprisePick,
                title: `Surprise pick: ${plannerPlan.surprisePick.summary || plannerPlan.surprisePick.title}`,
                time: plannerPlan.surprisePick.displayTime,
              },
            ]
          : []),
      ],
      render: (item) => ({
        title: `${item.date} ${item.title || item.summary}`,
        subtitle: item.time || item.displayTime || "Time not listed",
        body: [item.location || "Campus activity", item.note].filter(Boolean),
        payload:
          item.startsAt && item.endsAt
            ? { ...buildEventPayload(item), label: "Add Rec Item" }
            : null,
      }),
    },
    {
      title: "Study + Updates",
      items: [
        ...(plannerPlan?.recCrowdSuggestions ?? []).map((item) => ({
          kind: "crowd",
          title: `Rec crowd window: ${item.date}`,
          subtitle: item.label,
          body: [item.note],
          location: item.location,
          startsAt: item.startsAt,
          endsAt: item.endsAt,
        })),
        ...(plannerPlan?.studySuggestions ?? []).map((item) => ({
          kind: "study",
          title: `Study block: ${item.date}`,
          subtitle: item.label,
          body: [`${item.durationMinutes} minutes in ${item.location}`, item.note],
          location: item.location,
          startsAt: item.startsAt,
          endsAt: item.endsAt,
          description: item.course
            ? `Study session for ${item.course}. ${item.note}`
            : item.note,
        })),
        ...(plannerPlan?.updateHighlights ?? []).slice(0, 4).map((item) => ({
          kind: "update",
          title: item.title,
          subtitle: item.feedTitle || item.displayTime || "Campus update",
          body: [item.summary].filter(Boolean),
        })),
      ],
      render: (item) => ({
        title: item.title,
        subtitle: item.subtitle,
        body: item.body,
        payload:
          item.startsAt && item.endsAt
            ? {
                summary: item.title,
                description: item.description
                  ? `${PLANNER_EVENT_MARKER} ${item.description}`
                  : `${PLANNER_EVENT_MARKER} ${item.body.join(" ")}`,
                location: item.location || "Pickler Memorial Library",
                startDateTime: item.startsAt,
                endDateTime: item.endsAt,
                label: item.kind === "study" ? "Add Study Block" : "Add Slot",
              }
            : null,
      }),
    },
    {
      title: "Detected Courses",
      items: plannerPlan?.inferredCourses ?? [],
      render: (item) => ({
        title: item.course,
        subtitle: `${item.meetingCount} calendar meeting(s) this week`,
        body: [
          item.samples?.map((sample) => `${sample.date} ${sample.label}`).join("; "),
        ].filter(Boolean),
        payload: null,
      }),
    },
  ];

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.studentName, studentName.trim());
  }, [studentName]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.calendarConnected, String(calendarConnected));
  }, [calendarConnected]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.onboardingComplete, String(onboardingComplete));
  }, [onboardingComplete]);

  useEffect(() => {
    const updateClock = () => setClockLabel(getCurrentClockLabel());
    updateClock();
    const intervalId = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("calendarConnected");
    const nextUserId = params.get("userId");

    if (nextUserId) {
      setUserId(nextUserId);
    }

    if (connected === "true") {
      setCalendarConnected(true);
      setVoiceStatus(
        "Google Calendar is connected. You can ask what fits your schedule or build your week.",
      );
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    setPlannerStepInput(getStepValue(plannerStep, plannerPreferences));
  }, [plannerPreferences, plannerStep]);

  useEffect(() => {
    async function loadPreferences() {
      try {
        const response = await fetch(
          `/api/planner/preferences?userId=${encodeURIComponent(userId)}`,
        );
        const data = await response.json();
        if (response.ok) {
          setPlannerPreferences(normalizePreferences(data.preferences));
        }
      } catch {
        // Ignore initial load failures.
      }
    }

    loadPreferences();
  }, [userId]);

  useEffect(() => {
    async function loadPlannerContext() {
      try {
        const response = await fetch(
          `/api/planner/context?userId=${encodeURIComponent(userId)}&date=${encodeURIComponent(date)}&timeZone=${encodeURIComponent("America/Chicago")}`,
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to load planner context.");
        }

        setPlannerCourseOptions(data.inferredCourses ?? []);
        if (typeof data.calendarConnected === "boolean") {
          setCalendarConnected((current) => current || data.calendarConnected);
        }
      } catch {
        setPlannerCourseOptions([]);
      }
    }

    loadPlannerContext();
  }, [userId, date]);

  function updatePlannerPreferences(value = plannerStepInput) {
    setPlannerPreferences((current) => applyStepValue(plannerStep, value, current));
  }

  function completeOnboarding() {
    if (!studentName.trim() || !calendarConnected) {
      return;
    }

    setOnboardingComplete(true);
  }

  function restartSetup() {
    localStorage.removeItem(STORAGE_KEYS.studentName);
    localStorage.removeItem(STORAGE_KEYS.calendarConnected);
    localStorage.removeItem(STORAGE_KEYS.onboardingComplete);
    setStudentName("");
    setCalendarConnected(false);
    setOnboardingComplete(false);
    setProfileOpen(false);
  }

  function connectCalendar() {
    window.location.href = `/api/calendar/google/auth-url?userId=${encodeURIComponent(userId)}&redirect=true`;
  }

  function stopPlayback() {
    window.speechSynthesis?.cancel();
  }

  function stopListening() {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        recognitionRef.current = null;
      }
    }

    isListeningRef.current = false;
    setIsListening(false);
    setListeningTab(null);
  }

  function stopAllVoice() {
    voiceConversationModeRef.current = false;
    stopPlayback();
    stopListening();
    stopRealtimeSession();
    setVoiceStatus("Stopped. You can talk again any time.");
  }

  function abortAssistantRequest(targetTab = activeTab) {
    const controller = conciergeRequestRef.current;

    if (controller) {
      controller.abort();
    }
  }

  function speakReply(text, onDone) {
    if (!autoSpeak || !window.speechSynthesis || !text) {
      onDone?.();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.lang = "en-US";
    utterance.onend = () => onDone?.();
    window.speechSynthesis.speak(utterance);
  }

  function startVoiceInput(targetTab = activeTab) {
    if (!speechRecognition) {
      window.alert("Speech recognition is not available in this browser.");
      return;
    }

    if (isListening && listeningTab === targetTab) {
      voiceConversationModeRef.current = false;
      stopListening();
      setVoiceStatus("Stopped. You can talk again any time.");
      return;
    }

    stopPlayback();
    stopListening();
    abortAssistantRequest(targetTab);

    voiceConversationModeRef.current = true;

    const recognition = new speechRecognition();
    const voiceSessionId = voiceSessionRef.current + 1;
    voiceSessionRef.current = voiceSessionId;
    recognitionRef.current = recognition;
    isListeningRef.current = true;
    setIsListening(true);
    setListeningTab(targetTab);
    lastTranscriptRef.current = "";
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    setVoiceStatus("Listening...");

    recognition.onresult = (resultEvent) => {
      let transcript = "";
      let hasFinalChunk = false;

      for (let index = 0; index < resultEvent.results.length; index += 1) {
        transcript += `${resultEvent.results[index][0].transcript} `;
        if (resultEvent.results[index].isFinal) {
          hasFinalChunk = true;
        }
      }

      const trimmed = transcript.trim();
      if (!trimmed || trimmed === lastTranscriptRef.current) {
        return;
      }

      lastTranscriptRef.current = trimmed;
      setQuestion(trimmed);

      if (hasFinalChunk) {
        setVoiceStatus("On it...");
        try { recognition.stop(); } catch {}
        void askConcierge(undefined, trimmed);
      }
    };

    recognition.onerror = (errorEvent) => {
      if (voiceSessionRef.current !== voiceSessionId) {
        return;
      }

      recognitionRef.current = null;
      isListeningRef.current = false;
      setIsListening(false);
      setListeningTab(null);
      setVoiceStatus(
        errorEvent?.error === "not-allowed"
          ? "Microphone permission was blocked. Allow mic access and try again."
          : "Voice input failed. Try again or type your question.",
      );
    };

    recognition.onend = () => {
      if (voiceSessionRef.current !== voiceSessionId) {
        return;
      }

      recognitionRef.current = null;
      isListeningRef.current = false;
      setIsListening(false);
      setListeningTab(null);
    };

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      isListeningRef.current = false;
      setIsListening(false);
      setListeningTab(null);
      setVoiceStatus("I could not start the microphone. Try again.");
    }
  }

  function cleanupRealtimeResources() {
    const worklet = realtimeWorkletRef.current;
    if (worklet) {
      worklet.disconnect();
      realtimeWorkletRef.current = null;
    }

    const stream = realtimeStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      realtimeStreamRef.current = null;
    }

    const ctx = realtimeAudioCtxRef.current;
    if (ctx && ctx.state !== "closed") {
      ctx.close();
      realtimeAudioCtxRef.current = null;
    }

    realtimeNextPlayTimeRef.current = 0;
    realtimeWsRef.current = null;
  }

  function stopRealtimeSession() {
    const ws = realtimeWsRef.current;
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      ws.close();
    }
    cleanupRealtimeResources();
    setIsRealtimeActive(false);
    setRealtimeStatus("");
  }

  async function startRealtimeSession() {
    if (isRealtimeActive) return;

    stopListening();
    stopPlayback();

    let audioCtx;
    try {
      audioCtx = new AudioContext({ sampleRate: 24000 });
      realtimeAudioCtxRef.current = audioCtx;
    } catch {
      setRealtimeStatus("Audio not supported in this browser.");
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      realtimeStreamRef.current = stream;
    } catch {
      setRealtimeStatus("Microphone access denied. Please allow mic access and try again.");
      audioCtx.close();
      realtimeAudioCtxRef.current = null;
      return;
    }

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${wsProtocol}//${window.location.host}/api/realtime`);
    realtimeWsRef.current = ws;

    ws.onopen = async () => {
      setIsRealtimeActive(true);
      setRealtimeTranscript([]);
      setRealtimeStatus("Connected. Speak naturally — no button needed.");

      try {
        await audioCtx.audioWorklet.addModule("/pcm-processor.js");
        const source = audioCtx.createMediaStreamSource(stream);
        const worklet = new AudioWorkletNode(audioCtx, "pcm-processor");
        realtimeWorkletRef.current = worklet;
        source.connect(worklet);

        worklet.port.onmessage = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            const bytes = new Uint8Array(e.data);
            let binary = "";
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            ws.send(
              JSON.stringify({ type: "input_audio_buffer.append", audio: btoa(binary) }),
            );
          }
        };
      } catch {
        setRealtimeStatus("Could not start audio capture.");
        stopRealtimeSession();
      }
    };

    ws.onmessage = (e) => {
      let event;
      try {
        event = JSON.parse(e.data);
      } catch {
        return;
      }

      if (event.type === "response.audio.delta" && event.delta) {
        const binaryStr = atob(event.delta);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

        const samples = new Int16Array(bytes.buffer);
        const floats = new Float32Array(samples.length);
        for (let i = 0; i < samples.length; i++) floats[i] = samples[i] / 32768;

        const buf = audioCtx.createBuffer(1, floats.length, 24000);
        buf.copyToChannel(floats, 0);
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(audioCtx.destination);

        const startTime = Math.max(
          audioCtx.currentTime + 0.02,
          realtimeNextPlayTimeRef.current,
        );
        src.start(startTime);
        realtimeNextPlayTimeRef.current = startTime + buf.duration;
        return;
      }

      if (event.type === "input_audio_buffer.speech_started") {
        realtimeNextPlayTimeRef.current = audioCtx.currentTime;
        setRealtimeStatus("Listening...");
        return;
      }

      if (event.type === "input_audio_buffer.speech_stopped") {
        setRealtimeStatus("Processing...");
        return;
      }

      if (event.type === "conversation.item.input_audio_transcription.completed") {
        const text = event.transcript?.trim();
        if (text) {
          setRealtimeTranscript((prev) => [...prev, { role: "user", text }]);
        }
        return;
      }

      if (event.type === "response.audio_transcript.delta") {
        const delta = event.delta ?? "";
        setRealtimeTranscript((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.partial) {
            return [
              ...prev.slice(0, -1),
              { role: "assistant", text: last.text + delta, partial: true },
            ];
          }
          return [...prev, { role: "assistant", text: delta, partial: true }];
        });
        setRealtimeStatus("Speaking...");
        return;
      }

      if (event.type === "response.audio_transcript.done") {
        setRealtimeTranscript((prev) => {
          const last = prev[prev.length - 1];
          if (last?.partial) {
            return [...prev.slice(0, -1), { role: "assistant", text: last.text }];
          }
          return prev;
        });
        setRealtimeStatus("Connected. Speak naturally — no button needed.");
        return;
      }

      if (event.type === "response.done") {
        setRealtimeStatus("Connected. Speak naturally — no button needed.");
        return;
      }

      if (event.type === "error") {
        setRealtimeStatus(`Error: ${event.error?.message ?? "Unknown error"}`);
      }
    };

    ws.onerror = () => {
      setRealtimeStatus("Connection error. Try again.");
      cleanupRealtimeResources();
      setIsRealtimeActive(false);
    };

    ws.onclose = () => {
      cleanupRealtimeResources();
      setIsRealtimeActive(false);
      setRealtimeStatus("");
    };
  }

  function resetConversation() {
    stopAllVoice();
    setConversationId(null);
    setConversation([]);
    setMeetingDraft(null);
    setMeetingForm({
      title: "",
      location: "",
      description: "",
      startDateTime: "",
      endDateTime: "",
      readyToCreate: false,
      requested: false,
    });
    setMeetingStatus("If the assistant drafts a meeting, it will appear here.");
    setMeetingLink("");
    setLatestAnswer("");
    setQuestion("");
    setVoiceStatus("Ready when you are.");
  }

  async function askConcierge(event, overrideQuestion) {
    event?.preventDefault();
    const activeQuestion = String(overrideQuestion ?? question).trim();
    if (!activeQuestion) {
      return;
    }

    stopListening();

    if (meetingDraft?.readyToCreate && CREATE_CONFIRMATION_PATTERN.test(activeQuestion)) {
      await createMeeting();
      setQuestion("");
      return;
    }

    setActiveTab("talk");
    setIsSending(true);
    setLatestAnswer("");

    try {
      const controller = new AbortController();
      conciergeRequestRef.current = controller;

      const response = await fetch("/api/concierge/respond/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          conversationId,
          userId,
          question: activeQuestion,
          date,
          timeZone: "America/Chicago",
          includeAudio: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Unable to get concierge response.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === "[DONE]") continue;

          let evt;
          try {
            evt = JSON.parse(raw);
          } catch {
            continue;
          }

          if (evt.type === "delta") {
            streamedText += evt.text;
            setLatestAnswer(streamedText);
          } else if (evt.type === "meta") {
            if (evt.conversationId) setConversationId(evt.conversationId);
          } else if (evt.type === "done") {
            setConversationId(evt.conversationId ?? null);
            setConversation(evt.conversation ?? []);
            setLatestAnswer(evt.textResponse || streamedText || "No answer returned.");
            setCalendarConnected(Boolean(evt.calendarConnected) || calendarConnected);

            if (evt.meetingDraft?.requested) {
              setMeetingDraft(evt.meetingDraft);
              setMeetingForm({
                title: evt.meetingDraft.title ?? "",
                location: evt.meetingDraft.location ?? "",
                description: evt.meetingDraft.description ?? "",
                startDateTime: toLocalInputValue(evt.meetingDraft.startDateTime),
                endDateTime: toLocalInputValue(evt.meetingDraft.endDateTime),
                readyToCreate: Boolean(evt.meetingDraft.readyToCreate),
                requested: true,
              });
              setMeetingStatus(
                evt.meetingDraft.readyToCreate
                  ? "Calendar draft is ready. Review it, then create it."
                  : evt.meetingDraft.clarification ||
                      "I still need a few details before creating this event.",
              );
            } else {
              setMeetingDraft(null);
              setMeetingLink("");
            }

            if (evt.weekPlan) {
              setPlannerPlan(evt.weekPlan);
              setPlannerSummary(
                evt.weekPlan.textResponse ||
                  "I built a weekly plan around your calendar and Truman data.",
              );
            }

            const finalText = evt.textResponse || streamedText;
            const restartVoiceIfNeeded = () => {
              if (voiceConversationModeRef.current) {
                setTimeout(() => {
                  if (voiceConversationModeRef.current) {
                    setVoiceStatus("Listening...");
                    startVoiceInput("talk");
                  }
                }, 250);
              }
            };
            speakReply(finalText, restartVoiceIfNeeded);
          } else if (evt.type === "error") {
            throw new Error(evt.message || "Streaming error from server.");
          }
        }
      }

      setQuestion("");
    } catch (error) {
      if (error.name === "AbortError") {
        setLatestAnswer("Listening for your new question...");
        return;
      }

      setLatestAnswer(error.message);
    } finally {
      conciergeRequestRef.current = null;
      setIsSending(false);
    }
  }

  async function createMeeting() {
    try {
      if (
        !meetingForm.title.trim() ||
        !meetingForm.startDateTime ||
        !meetingForm.endDateTime
      ) {
        throw new Error("Meeting title, start time, and end time are required.");
      }

      const response = await fetch("/api/calendar/google/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          timeZone: "America/Chicago",
          summary: meetingForm.title.trim(),
          location: meetingForm.location.trim(),
          description: meetingForm.description.trim(),
          startDateTime: new Date(meetingForm.startDateTime).toISOString(),
          endDateTime: new Date(meetingForm.endDateTime).toISOString(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to create Google Calendar event.");
      }

      setCalendarConnected(true);
      setMeetingStatus("Meeting created in Google Calendar successfully with reminders.");
      setMeetingLink(data.event?.htmlLink || "");
      setMeetingDraft((current) =>
        current ? { ...current, readyToCreate: false } : current,
      );
      setLatestAnswer(
        "Your meeting is now on Google Calendar. I added a 10-minute popup reminder and a 1-day email reminder.",
      );
      setConversation((current) => [
        ...current,
        {
          role: "assistant",
          text: "Your meeting is now on Google Calendar. Use the link below if you want to open it.",
        },
      ]);
      speakReply("Your meeting is now on Google Calendar.");
    } catch (error) {
      setMeetingStatus(error.message);
    }
  }

  async function savePlannerPreferences() {
    const syncedPreferences = applyStepValue(
      plannerStep,
      plannerStepInput,
      plannerPreferences,
    );
    setPlannerPreferences(syncedPreferences);

    try {
      const response = await fetch("/api/planner/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          preferences: syncedPreferences,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to save planner preferences.");
      }

      setPlannerPreferences(normalizePreferences(data.preferences));
      setPlannerSummary(
        "Progress saved. When you're ready, build the week and I'll generate the plan step by step.",
      );
    } catch (error) {
      setPlannerSummary(error.message);
    }
  }

  async function buildWeekPlan(options = {}) {
    const { forceRefresh = false } = options;
    const syncedPreferences = applyStepValue(
      plannerStep,
      plannerStepInput,
      plannerPreferences,
    );
    setPlannerPreferences(syncedPreferences);
    setActiveTab("planner");
    setIsBuildingPlan(true);
    setPlannerSummary("Building your personalized Truman week...");

    try {
      const response = await fetch("/api/planner/week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          date,
          timeZone: "America/Chicago",
          question: "Plan my week",
          preferences: syncedPreferences,
          forceRefresh,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to build weekly plan.");
      }

      setPlannerPlan(data);
      setPlannerPreferences(normalizePreferences(data.preferences ?? syncedPreferences));
      setPlannerCourseOptions(data.inferredCourses ?? []);
      setCalendarConnected(Boolean(data.calendarConnected) || calendarConnected);
      setPlannerSummary(
        data.textResponse ||
          "Your week is ready. I'll reveal it section by section so it stays easy to review.",
      );
      setShowPlannerJourney(false);
      setPlannerRevealIndex(0);
    } catch (error) {
      setPlannerSummary(error.message);
    } finally {
      setIsBuildingPlan(false);
    }
  }

  async function savePlannerItem(payload, key) {
    setSavingItemKey(key);
    try {
      const response = await fetch("/api/calendar/google/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          timeZone: "America/Chicago",
          ...payload,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to save this planner item.");
      }

      setCalendarConnected(true);
      setPlannerSummary("Saved that planner item to Google Calendar.");
    } catch (error) {
      setPlannerSummary(error.message);
    } finally {
      setSavingItemKey("");
    }
  }

  async function saveWholePlan() {
    const events = buildWeekPlanCalendarItems(plannerPlan);
    if (!events.length) {
      setPlannerSummary("There are no timed planner items ready to save yet.");
      return;
    }

    setIsSavingWholePlan(true);
    try {
      const response = await fetch("/api/calendar/google/events/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          timeZone: "America/Chicago",
          events,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to save the weekly plan.");
      }

      setCalendarConnected(true);
      if (data.skippedCount) {
        setPlannerSummary(
          `Saved ${data.count} weekly plan item(s). Skipped ${data.skippedCount} because they overlapped existing calendar events.`,
        );
      } else {
        setPlannerSummary(`Saved ${data.count} weekly plan item(s) to Google Calendar.`);
      }
    } catch (error) {
      setPlannerSummary(error.message);
    } finally {
      setIsSavingWholePlan(false);
    }
  }

  const visibleSections = plannerSections.slice(
    0,
    plannerRevealIndex >= 0 ? plannerRevealIndex + 1 : 0,
  );
  const nextRevealSection =
    plannerRevealIndex + 1 < plannerSections.length
      ? plannerSections[plannerRevealIndex + 1]
      : null;

  return (
    <div className="app-shell">
      <div className="bg-orb bg-orb-left"></div>
      <div className="bg-orb bg-orb-right"></div>

      {!onboardingComplete ? (
        <section className="onboarding-screen">
          <div className="phone-statusbar">
            <span>{clockLabel}</span>
            <div className="phone-island"></div>
            <span className="statusbar-spacer" aria-hidden="true"></span>
          </div>
          <div className="device-card onboarding-card">
            <div className="brand-mark">TS</div>
            <p className="eyebrow">TruCompass</p>
            <h1 className="screen-title">A smarter Truman week starts here.</h1>
            <p className="screen-copy">
              Tell me your name, connect Google Calendar, and I'll build daily answers
              and weekly plans around your real schedule.
            </p>

            <div className="setup-steps">
              <div className="setup-step">
                <span>01</span>
                <div>
                  <strong>Tell me your name</strong>
                  <p>I'll personalize the experience around you.</p>
                </div>
              </div>
              <div className="setup-step">
                <span>02</span>
                <div>
                  <strong>Connect Google Calendar</strong>
                  <p>That lets me plan around classes, meetings, and free blocks.</p>
                </div>
              </div>
            </div>

            <label className="field-shell">
              <span>Your Name</span>
              <input
                value={studentName}
                onChange={(event) => setStudentName(event.target.value)}
                placeholder="Ankit"
              />
            </label>

            <div className="status-pill">
              <span>Calendar</span>
              <strong>{calendarConnected ? "Connected" : "Not connected"}</strong>
            </div>

            <div className="stack-actions">
              <button className="primary-button" onClick={connectCalendar} type="button">
                Connect Google Calendar
              </button>
              <button
                className="secondary-button"
                disabled={!studentName.trim() || !calendarConnected}
                onClick={completeOnboarding}
                type="button"
              >
                Enter App
              </button>
            </div>
          </div>
          <div className="home-indicator"></div>
        </section>
      ) : (
        <section className="device-shell">
          <div className="phone-statusbar">
            <span>{clockLabel}</span>
            <div className="phone-island"></div>
            <span className="statusbar-spacer" aria-hidden="true"></span>
          </div>
          <header className="topbar">
            <div>
                    <p className="eyebrow">TruCompass</p>
              <h2 className="greeting">Hello, {firstName}.</h2>
              <p className="subtle-copy">
                Voice-first campus help and a weekly plan built around your real calendar.
              </p>
            </div>
            <button
              className="avatar-button"
              onClick={() => setProfileOpen(true)}
              type="button"
            >
              {profileInitial}
            </button>
          </header>

          <nav className="tab-switch">
            <button
              className={activeTab === "talk" ? "tab-button active" : "tab-button"}
              onClick={() => setActiveTab("talk")}
              type="button"
            >
              Daily Concierge
            </button>
            <button
              className={activeTab === "planner" ? "tab-button active" : "tab-button"}
              onClick={() => setActiveTab("planner")}
              type="button"
            >
              Plan My Week
            </button>
          </nav>

          {activeTab === "talk" ? (
            <div className="screen-stack">
              <section className="device-card talk-card">
                <div className="talk-header">
                  <div>
                    <p className="eyebrow">Daily Concierge</p>
                    <p className="subtle-copy">
                      Ask naturally. I will figure out the day and time from your question.
                    </p>
                  </div>
                  <span className="date-chip compact-date-chip">
                    <span>Date</span>
                    <strong>{talkDateLabel}</strong>
                  </span>
                </div>

                <div className="meta-row">
                  <span className="status-pill">
                    <span>Chat</span>
                    <strong>{conversationId ? conversationId.slice(0, 8) : "new"}</strong>
                  </span>
                  <span className="status-pill">
                    <span>Calendar</span>
                    <strong>{calendarConnected ? "Connected" : "Not connected"}</strong>
                  </span>
                </div>

                <div className="chat-thread">
                  {isRealtimeActive ? (
                    realtimeTranscript.length ? (
                      realtimeTranscript.map((message, index) => (
                        <article
                          key={index}
                          className={message.role === "user" ? "bubble bubble-user" : "bubble bubble-assistant"}
                        >
                          <strong>{message.role === "user" ? "You" : "Concierge"}</strong>
                          <p>{message.text}</p>
                        </article>
                      ))
                    ) : (
                      <article className="bubble bubble-system">
                        <strong>Live Concierge</strong>
                        <p>Speak naturally — I'm listening. No button needed. Your words and my replies appear here.</p>
                      </article>
                    )
                  ) : conversation.length ? (
                    conversation.map((message, index) => (
                      <article
                        key={`${message.role}-${index}`}
                        className={message.role === "user" ? "bubble bubble-user" : "bubble bubble-assistant"}
                      >
                        <strong>{message.role === "user" ? "You" : "Concierge"}</strong>
                        <p>{message.text}</p>
                      </article>
                    ))
                  ) : (
                    <article className="bubble bubble-system">
                      <strong>Concierge</strong>
                      <p>Tap the mic, ask naturally, and I'll answer right here in the same thread.</p>
                    </article>
                  )}
                </div>

                {meetingDraft?.requested ? (
                  <div className="draft-card">
                    <div className="draft-card-top">
                      <div>
                        <p className="eyebrow">Calendar Draft</p>
                        <h3>Ready to save</h3>
                      </div>
                      <button className="primary-button small-button" onClick={createMeeting} type="button">
                        Create
                      </button>
                    </div>

                    <div className="draft-grid">
                      <label className="field-shell">
                        <span>Title</span>
                        <input
                          value={meetingForm.title}
                          onChange={(event) =>
                            setMeetingForm((current) => ({ ...current, title: event.target.value }))
                          }
                        />
                      </label>
                      <label className="field-shell">
                        <span>Location</span>
                        <input
                          value={meetingForm.location}
                          onChange={(event) =>
                            setMeetingForm((current) => ({ ...current, location: event.target.value }))
                          }
                        />
                      </label>
                      <label className="field-shell full-span">
                        <span>Notes</span>
                        <textarea
                          rows="3"
                          value={meetingForm.description}
                          onChange={(event) =>
                            setMeetingForm((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="field-shell">
                        <span>Start</span>
                        <input
                          type="datetime-local"
                          value={meetingForm.startDateTime}
                          onChange={(event) =>
                            setMeetingForm((current) => ({
                              ...current,
                              startDateTime: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="field-shell">
                        <span>End</span>
                        <input
                          type="datetime-local"
                          value={meetingForm.endDateTime}
                          onChange={(event) =>
                            setMeetingForm((current) => ({
                              ...current,
                              endDateTime: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>

                    <p className="subtle-copy">{meetingStatus}</p>
                    {meetingLink ? (
                      <a className="inline-link" href={meetingLink} rel="noreferrer" target="_blank">
                        Open in Google Calendar
                      </a>
                    ) : null}
                  </div>
                ) : null}

                <form className="talk-dock" onSubmit={askConcierge}>
                  <textarea
                    className="message-input"
                    rows="2"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="Type here if you don't want to talk..."
                  />

                <div className="voice-core">
                  <button
                    className="orb-button"
                    onClick={() => startVoiceInput("talk")}
                    type="button"
                  >
                    <span>{isListening && listeningTab === "talk" ? "Listening" : "Talk"}</span>
                  </button>
                  <p className="voice-caption">{voiceStatus}</p>
                </div>

                  <div className="action-row">
                    <button className="secondary-button" disabled={isSending} type="submit">
                      {isSending ? "Sending..." : "Send"}
                    </button>
                    <button className="secondary-button" onClick={stopAllVoice} type="button">
                      Stop
                    </button>
                    <button className="secondary-button" onClick={resetConversation} type="button">
                      New Chat
                    </button>
                  </div>
                </form>

                <div className="chip-row">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      className="ghost-chip"
                      onClick={() => {
                        setQuestion(prompt);
                        setTimeout(() => {
                          void askConcierge(undefined, prompt);
                        }, 0);
                      }}
                      type="button"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>

                <div className="toggle-row">
                  <label className="toggle-pill">
                    <input
                      checked={autoSpeak}
                      onChange={(event) => setAutoSpeak(event.target.checked)}
                      type="checkbox"
                    />
                    <span>Speak replies</span>
                  </label>
                </div>
              </section>
            </div>
          ) : (
            <div className="screen-stack">
              <section className="device-card planner-card">
                <div className="planner-header">
                  <div>
                    <p className="eyebrow">Plan My Week</p>
                    <h3 className="planner-headline">
                      Build a Truman week around your real schedule.
                    </h3>
                  </div>
                </div>

                <div className="week-picker-card">
                  <div className="week-picker-copy">
                    <p className="eyebrow">Week Of</p>
                    <strong>{weekRangeLabel}</strong>
                  </div>
                  <div className="week-picker-controls">
                    <button
                      className="secondary-button small-button"
                      onClick={() => setDate((current) => addDaysToDateKey(current, -7))}
                      type="button"
                    >
                      - 7 days
                    </button>
                    <label className="field-shell week-date-field">
                      <span>Start</span>
                      <input
                        type="date"
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                      />
                    </label>
                    <button
                      className="secondary-button small-button"
                      onClick={() => setDate((current) => addDaysToDateKey(current, 7))}
                      type="button"
                    >
                      + 7 days
                    </button>
                  </div>
                </div>

                {showPlannerJourney ? (
                  <div className="journey-card">
                    <div className="journey-progress">
                      <span className="status-pill">
                        <span>Step</span>
                        <strong>
                          {plannerStepIndex + 1} / {PLANNER_STEPS.length}
                        </strong>
                      </span>
                    </div>
                    <p className="eyebrow">{plannerStep.label}</p>
                    <h4 className="journey-question">{plannerStep.question}</h4>
                    <p className="subtle-copy">{plannerStep.help}</p>

                    <div className="choice-grid">
                      {plannerStepChoices.map((choice) => {
                        const stepValue = getStepValue(plannerStep, plannerPreferences);
                        const selectedValues = splitCsv(stepValue).map((item) =>
                          item.toLowerCase(),
                        );
                        const active =
                          plannerStep.inputMode === "choice-only"
                            ? stepValue.toLowerCase() === choice.toLowerCase()
                            : selectedValues.includes(choice.toLowerCase());

                        return (
                          <button
                            key={choice}
                            className={active ? "choice-chip active" : "choice-chip"}
                            onClick={() => {
                              if (plannerStep.inputMode === "choice-only") {
                                const nextChoice = active ? "" : choice;
                                const next = applyStepValue(
                                  plannerStep,
                                  nextChoice,
                                  plannerPreferences,
                                );
                                setPlannerPreferences(next);
                                setPlannerStepInput(nextChoice);
                                return;
                              }

                              const current = splitCsv(plannerStepInput);
                              const normalized = new Set(
                                current.map((item) => item.toLowerCase()),
                              );
                              const nextInput = normalized.has(choice.toLowerCase())
                                ? current
                                    .filter((item) => item.toLowerCase() !== choice.toLowerCase())
                                    .join(", ")
                                : [...current, choice].join(", ");

                              setPlannerStepInput(nextInput);
                              setPlannerPreferences((currentPreferences) =>
                                applyStepValue(
                                  plannerStep,
                                  nextInput,
                                  currentPreferences,
                                ),
                              );
                            }}
                            type="button"
                          >
                            {choice}
                          </button>
                        );
                      })}
                    </div>

                    {plannerStep.inputMode !== "choice-only" ? (
                      <label className="field-shell">
                        <span>Your answer</span>
                        <input
                          value={plannerStepInput}
                          onChange={(event) => {
                            setPlannerStepInput(event.target.value);
                            setPlannerPreferences((current) =>
                              applyStepValue(plannerStep, event.target.value, current),
                            );
                          }}
                          placeholder={plannerStep.placeholder}
                        />
                      </label>
                    ) : null}

                    <div className="planner-action-row">
                      <button
                        className="secondary-button"
                        disabled={plannerStepIndex === 0}
                        onClick={() => setPlannerStepIndex((current) => Math.max(0, current - 1))}
                        type="button"
                      >
                        Back
                      </button>
                      {plannerStepIndex === PLANNER_STEPS.length - 1 ? (
                        <button
                          className="primary-button"
                          disabled={isBuildingPlan}
                          onClick={buildWeekPlan}
                          type="button"
                        >
                          {isBuildingPlan ? "Building..." : "Build My Week"}
                        </button>
                      ) : (
                        <button
                          className="primary-button"
                          onClick={() =>
                            setPlannerStepIndex((current) =>
                              Math.min(PLANNER_STEPS.length - 1, current + 1),
                            )
                          }
                          type="button"
                        >
                          Next
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="planner-summary-shell">
                    <div className="planner-summary-card">
                      <p className="eyebrow">Weekly Summary</p>
                      <p className="summary-copy">{plannerSummary}</p>
                    </div>

                    <div className="planner-toolbar">
                      <button
                        className="secondary-button"
                        onClick={() => setShowPlannerJourney(true)}
                        type="button"
                      >
                        Edit Answers
                      </button>
                      <button className="secondary-button" onClick={savePlannerPreferences} type="button">
                        Save Progress
                      </button>
                      {plannerPlan ? (
                        <button
                          className="secondary-button"
                          disabled={isBuildingPlan}
                          onClick={() => buildWeekPlan({ forceRefresh: true })}
                          type="button"
                        >
                          {isBuildingPlan ? "Refreshing..." : "Refresh Plan"}
                        </button>
                      ) : null}
                      <button
                        className="primary-button"
                        disabled={isSavingWholePlan}
                        onClick={saveWholePlan}
                        type="button"
                      >
                        {isSavingWholePlan ? "Saving..." : "Add Whole Plan To Calendar"}
                      </button>
                    </div>

                    {plannerPlan ? (
                      <>
                        <div className="reveal-card">
                          <p className="subtle-copy">
                            {nextRevealSection
                              ? `I'll reveal ${nextRevealSection.title.toLowerCase()} next so the week stays easy to review.`
                              : "Your full week is ready. Open any section below or save the whole plan now."}
                          </p>
                          {nextRevealSection ? (
                            <button
                              className="primary-button"
                              onClick={() =>
                                setPlannerRevealIndex((current) =>
                                  Math.min(current + 1, plannerSections.length - 1),
                                )
                              }
                              type="button"
                            >
                              Show {nextRevealSection.title}
                            </button>
                          ) : null}
                        </div>

                        {visibleSections.map((section, sectionIndex) => (
                          <details
                            key={section.title}
                            className="plan-section"
                            open={sectionIndex === visibleSections.length - 1}
                          >
                            <summary>{section.title}</summary>
                            <div className="plan-items">
                              {section.items.length ? (
                                section.items.map((item, itemIndex) => {
                                  const view = section.render(item);
                                  const saveKey = `${section.title}-${itemIndex}`;
                                  return (
                                    <article key={saveKey} className="plan-item-card">
                                      <div>
                                        <h4>{view.title}</h4>
                                        {view.subtitle ? <p className="plan-item-meta">{view.subtitle}</p> : null}
                                        {view.body.map((line) =>
                                          line ? (
                                            <p className="plan-item-copy" key={`${saveKey}-${line}`}>
                                              {line}
                                            </p>
                                          ) : null,
                                        )}
                                      </div>
                                      {view.payload ? (
                                        <button
                                          className="secondary-button small-button"
                                          disabled={savingItemKey === saveKey}
                                          onClick={() => savePlannerItem(view.payload, saveKey)}
                                          type="button"
                                        >
                                          {savingItemKey === saveKey
                                            ? "Saving..."
                                            : view.payload.label}
                                        </button>
                                      ) : null}
                                    </article>
                                  );
                                })
                              ) : (
                                <article className="plan-item-card empty">
                                  <p>No suggestions yet in this section.</p>
                                </article>
                              )}
                            </div>
                          </details>
                        ))}
                      </>
                    ) : null}
                  </div>
                )}
              </section>
            </div>
          )}
          <div className="home-indicator"></div>
        </section>
      )}

      {profileOpen ? (
        <div className="sheet-backdrop" onClick={() => setProfileOpen(false)} role="presentation">
          <aside className="side-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="side-sheet-top">
              <div className="profile-pill">
                <div className="profile-avatar">{profileInitial}</div>
                <div>
                  <p className="eyebrow">Profile</p>
                  <h3>{studentName || "Truman Student"}</h3>
                </div>
              </div>
              <button className="secondary-button small-button" onClick={() => setProfileOpen(false)} type="button">
                Close
              </button>
            </div>

            <div className="profile-panel">
              <span className="status-label">Calendar</span>
              <strong>{calendarConnected ? "Connected" : "Not connected"}</strong>
              <p className="subtle-copy">
                Connect once so Daily Concierge and Plan My Week can build around real
                classes and meetings.
              </p>
            </div>

            <div className="stack-actions">
              <button className="primary-button" onClick={connectCalendar} type="button">
                Connect Google Calendar
              </button>
              <button className="secondary-button" onClick={restartSetup} type="button">
                Restart Setup
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

export default App;
