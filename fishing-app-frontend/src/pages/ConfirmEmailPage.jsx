import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { confirmEmail, getMe, resendEmailCode } from "../api/authApi";
import { useAuth } from "../context/AuthContext";
import "../styles/auth.css";

export default function ConfirmEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { login, setUser } = useAuth();

  const initialEmail = useMemo(() => {
    return location.state?.email || searchParams.get("email") || "";
  }, [location.state, searchParams]);

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState(
    initialEmail
      ? `Мы отправили код подтверждения на ${initialEmail}.`
      : "Введите email и код подтверждения."
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  function normalizeCode(value) {
    return value.replace(/\D/g, "").slice(0, 6);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!email.trim()) {
      setError("Введите email.");
      return;
    }

    if (code.length !== 6) {
      setError("Код должен состоять из 6 цифр.");
      return;
    }

    try {
      setIsSubmitting(true);

      const authResponse = await confirmEmail({
        email: email.trim(),
        code,
      });

      login(authResponse);

      const me = await getMe();
      setUser(me);

      navigate("/profile");
    } catch (err) {
      console.error(err);
      setError(err.message || "Не удалось подтвердить email.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendCode() {
    setError("");
    setInfo("");

    if (!email.trim()) {
      setError("Введите email, чтобы отправить код повторно.");
      return;
    }

    try {
      setIsResending(true);

      const response = await resendEmailCode({
        email: email.trim(),
      });

      setInfo(response?.message || "Новый код отправлен.");
      startCooldown(60);
    } catch (err) {
      console.error(err);
      setError(err.message || "Не удалось отправить код повторно.");
      startCooldown(60);
    } finally {
      setIsResending(false);
    }
  }

  function startCooldown(seconds) {
    setResendCooldown(seconds);

    const intervalId = window.setInterval(() => {
      setResendCooldown((current) => {
        if (current <= 1) {
          window.clearInterval(intervalId);
          return 0;
        }

        return current - 1;
      });
    }, 1000);
  }

  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="auth-header">
          <div className="auth-badge">✉️ Подтверждение</div>

          <h1 className="auth-title">Проверьте почту</h1>

          <p className="auth-subtitle">
            Введите 6-значный код из письма. Если письмо не пришло, проверьте
            папку “Спам” или отправьте код повторно.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-row">
            <label className="auth-label" htmlFor="confirm-email">
              Email
            </label>
            <input
              id="confirm-email"
              className="auth-input"
              type="email"
              placeholder="example@yandex.ru"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="auth-row">
            <label className="auth-label" htmlFor="confirm-code">
              Код подтверждения
            </label>
            <input
              id="confirm-code"
              className="auth-input auth-code-input"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
          </div>

          {error && <div className="auth-alert auth-alert-error">{error}</div>}
          {info && <div className="auth-alert auth-alert-success">{info}</div>}

          <button className="auth-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Проверяем код..." : "Подтвердить email"}
          </button>

          <button
            className="auth-button-secondary"
            type="button"
            onClick={handleResendCode}
            disabled={isResending || resendCooldown > 0}
          >
            {resendCooldown > 0
              ? `Отправить повторно через ${resendCooldown} сек.`
              : isResending
                ? "Отправляем..."
                : "Отправить код повторно"}
          </button>
        </form>

        <div className="auth-footer">
          Уже подтвердили email? <Link to="/login">Перейти ко входу</Link>
        </div>
      </section>
    </div>
  );
}