import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getMe, login as loginRequest } from "../api/authApi";
import { useAuth } from "../context/AuthContext";
import "../styles/auth.css";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, setUser } = useAuth();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(location.state?.message || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field, value) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setInfo("");

    try {
      setIsSubmitting(true);

      const authResponse = await loginRequest({
        email: form.email.trim(),
        password: form.password,
      });

      login(authResponse);

      const me = await getMe();
      setUser(me);

      navigate("/profile");
    } catch (err) {
      console.error(err);

      if (err.status === 403 && err.data?.requiresEmailConfirmation) {
        navigate(`/confirm-email?email=${encodeURIComponent(err.data.email || form.email)}`, {
          state: {
            email: err.data.email || form.email,
            fromLogin: true,
          },
        });
        return;
      }

      setError(`Не удалось выполнить вход: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="auth-header">
          <div className="auth-badge">🔐 Вход в аккаунт</div>

          <h1 className="auth-title">Добро пожаловать</h1>

          <p className="auth-subtitle">
            Войдите в НаКлёве, чтобы открыть профиль, ленту, отчёты, карту и
            чаты.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-row">
            <label className="auth-label" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              className="auth-input"
              type="email"
              placeholder="example@yandex.ru"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="auth-row">
            <label className="auth-label" htmlFor="login-password">
              Пароль
            </label>

            <div className="auth-input-wrap">
              <input
                id="login-password"
                className="auth-input auth-input-with-action"
                type={showPassword ? "text" : "password"}
                placeholder="Введите пароль"
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
                required
                autoComplete="current-password"
              />

              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                title={showPassword ? "Скрыть пароль" : "Показать пароль"}
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>

            <div style={{ textAlign: "right", marginTop: "2px" }}>
              <Link className="auth-link" to="/forgot-password">
                Забыли пароль?
              </Link>
            </div>
          </div>

          {error && <div className="auth-alert auth-alert-error">{error}</div>}
          {info && <div className="auth-alert auth-alert-success">{info}</div>}

          <button className="auth-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Входим..." : "Войти"}
          </button>
        </form>

        <div className="auth-footer">
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </div>

        <div className="auth-legal-links" aria-label="Юридические документы">
          <Link to="/terms">Пользовательское соглашение</Link>
          <Link to="/privacy-policy">Политика обработки данных</Link>
          <Link to="/personal-data-consent">Согласие на обработку данных</Link>
        </div>
      </section>
    </div>
  );
}