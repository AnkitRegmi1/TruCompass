const DEFAULT_TIMEOUT_MS = 15_000;

async function readErrorBody(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function performRequest(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await readErrorBody(response);
      const details = errorBody ? ` - ${errorBody}` : "";
      throw new Error(
        `Request failed with status ${response.status} ${response.statusText}${details}`,
      );
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestJson(url, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.json ? { "Content-Type": "application/json" } : {}),
    ...(options.headers ?? {}),
  };

  const response = await performRequest(url, {
    ...options,
    headers,
    body: options.json ? JSON.stringify(options.json) : options.body,
  });

  return response.json();
}

export async function requestText(url, options = {}) {
  const headers = {
    ...(options.headers ?? {}),
  };

  const response = await performRequest(url, {
    ...options,
    headers,
  });

  return response.text();
}

export async function requestBinary(url, options = {}) {
  const response = await performRequest(url, options);
  return Buffer.from(await response.arrayBuffer());
}

export async function requestForm(url, options = {}) {
  const headers = {
    ...(options.headers ?? {}),
    "Content-Type": "application/x-www-form-urlencoded",
  };

  const response = await performRequest(url, {
    ...options,
    headers,
    body: new URLSearchParams(options.form ?? {}).toString(),
  });

  return response.json();
}
