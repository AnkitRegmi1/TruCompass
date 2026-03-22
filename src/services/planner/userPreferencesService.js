const DEFAULT_PREFERENCES = {
  preferredDiningHalls: [],
  favoriteFoods: [],
  dislikedFoods: [],
  favoriteEventTypes: [],
  preferredRecActivities: [],
  recSessionsPerWeek: 0,
  preferredRecTime: "",
  preferredRecCrowd: "",
  wantsRecClasses: null,
  wantsSurpriseEvents: null,
  weeklyFocus: "",
  studyHoursPerWeek: 0,
  preferredStudyWindow: "",
  hardestCourses: [],
  preferredMealWindows: {
    lunch: "",
    dinner: "",
  },
};

function uniqueValues(values) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

function mergeMealWindows(base, incoming) {
  return {
    lunch: incoming?.lunch ?? base?.lunch ?? "",
    dinner: incoming?.dinner ?? base?.dinner ?? "",
  };
}

function normalizePreferences(preferences = {}) {
  const wantsRecClasses =
    typeof preferences.wantsRecClasses === "boolean"
      ? preferences.wantsRecClasses
      : typeof preferences.wantsRecClasses === "string"
        ? /^(true|yes|y|classes)$/i.test(String(preferences.wantsRecClasses).trim())
          ? true
          : /^(false|no|n|workout-only)$/i.test(
                String(preferences.wantsRecClasses).trim(),
              )
            ? false
            : null
        : null;

  return {
    preferredDiningHalls: uniqueValues(preferences.preferredDiningHalls),
    favoriteFoods: uniqueValues(preferences.favoriteFoods),
    dislikedFoods: uniqueValues(preferences.dislikedFoods),
    favoriteEventTypes: uniqueValues(preferences.favoriteEventTypes),
    preferredRecActivities: uniqueValues(preferences.preferredRecActivities),
    recSessionsPerWeek: Number(preferences.recSessionsPerWeek ?? 0) || 0,
    preferredRecTime: String(preferences.preferredRecTime ?? "").trim(),
    preferredRecCrowd: String(preferences.preferredRecCrowd ?? "").trim(),
    wantsRecClasses,
    wantsSurpriseEvents:
      typeof preferences.wantsSurpriseEvents === "boolean"
        ? preferences.wantsSurpriseEvents
        : null,
    weeklyFocus: String(preferences.weeklyFocus ?? "").trim(),
    studyHoursPerWeek: Number(preferences.studyHoursPerWeek ?? 0) || 0,
    preferredStudyWindow: String(preferences.preferredStudyWindow ?? "").trim(),
    hardestCourses: uniqueValues(preferences.hardestCourses),
    preferredMealWindows: mergeMealWindows(
      DEFAULT_PREFERENCES.preferredMealWindows,
      preferences.preferredMealWindows,
    ),
  };
}

export class UserPreferencesService {
  constructor({ cache, store = null }) {
    this.cache = cache;
    this.store = store;
  }

  async getPreferences(userId) {
    if (!userId) {
      return { ...DEFAULT_PREFERENCES };
    }

    if (this.store?.getPreferences) {
      return {
        ...DEFAULT_PREFERENCES,
        ...normalizePreferences((await this.store.getPreferences(userId)) ?? {}),
      };
    }

    const payload = (await this.cache.read()) ?? {};
    return {
      ...DEFAULT_PREFERENCES,
      ...normalizePreferences(payload[userId] ?? {}),
    };
  }

  async savePreferences(userId, preferences) {
    if (!userId) {
      throw new Error("userId is required to save planner preferences.");
    }

    const current = await this.getPreferences(userId);
    const merged = {
      ...current,
      ...normalizePreferences(preferences),
      preferredMealWindows: mergeMealWindows(
        current.preferredMealWindows,
        preferences?.preferredMealWindows,
      ),
    };

    if (this.store?.savePreferences) {
      await this.store.savePreferences(userId, merged);
    } else {
      const payload = (await this.cache.read()) ?? {};
      await this.cache.write({
        ...payload,
        [userId]: merged,
      });
    }

    return merged;
  }

  async mergePreferences(userId, preferences) {
    const current = await this.getPreferences(userId);
    return this.savePreferences(userId, {
      ...current,
      ...preferences,
      preferredDiningHalls: uniqueValues([
        ...current.preferredDiningHalls,
        ...(preferences?.preferredDiningHalls ?? []),
      ]),
      favoriteFoods: uniqueValues([
        ...current.favoriteFoods,
        ...(preferences?.favoriteFoods ?? []),
      ]),
      dislikedFoods: uniqueValues([
        ...current.dislikedFoods,
        ...(preferences?.dislikedFoods ?? []),
      ]),
      favoriteEventTypes: uniqueValues([
        ...current.favoriteEventTypes,
        ...(preferences?.favoriteEventTypes ?? []),
      ]),
      preferredRecActivities: uniqueValues([
        ...current.preferredRecActivities,
        ...(preferences?.preferredRecActivities ?? []),
      ]),
      recSessionsPerWeek:
        Number(preferences?.recSessionsPerWeek ?? 0) || current.recSessionsPerWeek || 0,
      preferredRecTime:
        preferences?.preferredRecTime ?? current.preferredRecTime ?? "",
      preferredRecCrowd:
        preferences?.preferredRecCrowd ?? current.preferredRecCrowd ?? "",
      wantsRecClasses:
        typeof preferences?.wantsRecClasses === "boolean"
          ? preferences.wantsRecClasses
          : current.wantsRecClasses,
      hardestCourses: uniqueValues([
        ...(current.hardestCourses ?? []),
        ...(preferences?.hardestCourses ?? []),
      ]),
      preferredMealWindows: mergeMealWindows(
        current.preferredMealWindows,
        preferences?.preferredMealWindows,
      ),
    });
  }
}
