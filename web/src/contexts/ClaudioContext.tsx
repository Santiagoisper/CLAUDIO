import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

interface ClaudioConfig {
  apiUrl: string;
  token: string;
}

interface ClaudioContextType {
  config: ClaudioConfig;
  setConfig: (config: ClaudioConfig) => void;
  isConfigured: boolean;
  saveConfig: (apiUrl: string, token: string) => void;
  clearConfig: () => void;
}

const ClaudioContext = createContext<ClaudioContextType | undefined>(undefined);

const STORAGE_KEY = "claudio-config";

export function ClaudioProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ClaudioConfig>(() => {
    const envToken = import.meta.env.VITE_CLAUDIO_TOKEN || "";
    const apiUrl = import.meta.env.PROD && typeof window !== "undefined"
      ? window.location.origin
      : import.meta.env.VITE_CLAUDIO_API_URL || "http://localhost:3737";
    const fallbackConfig = {
      apiUrl,
      token: "",
    };

    // La configuración ingresada por el usuario debe sobrevivir a recargas.
    // Nunca se limpia todo localStorage: puede borrar el token recién guardado.
    let savedConfig: ClaudioConfig | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ClaudioConfig>;
        if (typeof parsed.apiUrl === "string" && typeof parsed.token === "string") {
          savedConfig = { apiUrl: parsed.apiUrl, token: parsed.token };
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }

    const cfg = envToken ? { apiUrl, token: envToken } : savedConfig ?? fallbackConfig;

    // Si hay token en env, guardarlo en localStorage
    if (envToken) {
      localStorage.setItem("claudio_token", envToken);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    }

    return cfg;
  });

  const isConfigured = !!config.token && !!config.apiUrl;

  const saveConfig = useCallback((apiUrl: string, token: string) => {
    const newConfig = { apiUrl, token };
    setConfig(newConfig);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    if (token) {
      localStorage.setItem("claudio_token", token);
    } else {
      localStorage.removeItem("claudio_token");
    }
  }, []);

  const clearConfig = useCallback(() => {
    setConfig({ apiUrl: "", token: "" });
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("claudio_token");
  }, []);

  return (
    <ClaudioContext.Provider
      value={{
        config,
        setConfig,
        isConfigured,
        saveConfig,
        clearConfig,
      }}
    >
      {children}
    </ClaudioContext.Provider>
  );
}

export function useClaudioConfig() {
  const context = useContext(ClaudioContext);
  if (!context) {
    throw new Error("useClaudioConfig debe usarse dentro de ClaudioProvider");
  }
  return context;
}
