import { createContext, useContext, type ReactNode } from "react";

interface AIActivityContextType {
  /** True while the AI is generating ideas or clustering. */
  isAIActive: boolean;
}

export const AIActivityContext = createContext<AIActivityContextType>({
  isAIActive: false,
});

export function AIActivityProvider({
  isAIActive,
  children,
}: {
  isAIActive: boolean;
  children: ReactNode;
}) {
  return (
    <AIActivityContext.Provider value={{ isAIActive }}>
      {children}
    </AIActivityContext.Provider>
  );
}

export const useAIActivity = () => useContext(AIActivityContext);
