import { createContext, useContext, useEffect, useState } from "react";
import { getMe } from "../api/authApi";
import { stopChatConnection } from "../api/chatHub";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  function login(authResponse) {
    localStorage.setItem("token", authResponse.token);
    setToken(authResponse.token);
  }

  async function logout() {
    localStorage.removeItem("token");
    await stopChatConnection();
    setToken(null);
    setUser(null);
    setAuthChecked(true);
  }

  useEffect(() => {
    async function handleTokenState() {
      if (!token) {
        await stopChatConnection();
        setUser(null);
      }
    }

    handleTokenState();
  }, [token]);

  useEffect(() => {
    async function restoreAuth() {
      if (!token) {
        setUser(null);
        setAuthChecked(true);
        return;
      }

      try {
        const me = await getMe();
        setUser(me);
      } catch (err) {
        console.error("Auth restore failed:", err);
        localStorage.removeItem("token");
        await stopChatConnection();
        setToken(null);
        setUser(null);
      } finally {
        setAuthChecked(true);
      }
    }

    setAuthChecked(false);
    restoreAuth();
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        setUser,
        login,
        logout,
        authChecked,
        isAuthenticated: !!token && !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}