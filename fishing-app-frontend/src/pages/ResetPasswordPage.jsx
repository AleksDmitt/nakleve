import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { forgotPassword, resetPassword } from "../api/authApi";
import "../styles/auth.css";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const initialEmail = useMemo(() => {
    return location.state?.email || searchParams.get("email") || "";
  }, [location.state, searchParams]);

  const [form, setForm] = useState({
    email: initialEmail,
    code: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState("");
  const [info, setInfo] = useState(
    initialEmail
      ? `Мы отправили код восстановления на ${initialEmail}.`
      : "Введите email, код восстановления и новый пароль."
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const passwordChecks = {
    length: form.newPassword.length >= 8,
    upper: /[A-ZА-ЯЁ]/.test(form.newPassword),
    lower: /[a-zа-яё]/.test(form.newPassword),
    digit: /\d/.test(form.newPassword),
    match:
      form.confirmPassword.length > 0 &&
      form.newPassword === form.confirmPassword,
  };

  const isPasswordValid =
    passwordChecks.length &&
    passwordChecks.upper &&
    passwordChecks.lower &&
    passwordChecks.digit &&
    passwordChecks.match;

  function updateField(field, value) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function normalizeCode(value) {
    return value.replace(/\D/g, "").slice(0, 6);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setInfo("");

    const email = form.email.trim();

    if (!email) {
      setError("Введите email.");
      return;
    }

    if (form.code.length !== 6) {
      setError("Код должен состоять из 6 цифр.");
      return;
    }

    if (!isPasswordValid) {
      setError("Новый пароль не соответствует требованиям безопасности.");
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await resetPassword({
        email,
        code: form.code,
        newPassword: form.newPassword,
      });

      navigate("/login", {
        state: {
          message:
            response?.message ||
            "Пароль успешно изменён. Теперь войдите с новым паролем.",
        },
      });
    } catch (err) {
      console.error(err);
      setError(err.message || "Не удалось изменить пароль.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendCode() {
    setError("");
    setInfo("");

    const email = form.email.trim();

    if (!email) {
      setError("Введите email, чтобы отправить код повторно.");
      return;
    }

    try {
      setIsResending(true);

      const response = await forgotPassword({
        email,
      });

      setInfo(response?.message || "Если аккаунт существует, мы отправили код.");
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
      <section className="auth-card auth-card-wide">
        <div className="auth-header">
          <div className="auth-badge">🛡️ Новый пароль</div>

          <h1 className="auth-title">Восстановление пароля</h1>

          <p className="auth-subtitle">
            Введите код из письма и задайте новый пароль для аккаунта.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-row">
            <label className="auth-label" htmlFor="reset-email">
              Email
            </label>
            <input
              id="reset-email"
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
            <label className="auth-label" htmlFor="reset-code">
              Код восстановления
            </label>
            <input
              id="reset-code"
              className="auth-input auth-code-input"
              placeholder="000000"
              value={form.code}
              onChange={(e) => updateField("code", normalizeCode(e.target.value))}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
          </div>

          <div className="auth-row">
            <label className="auth-label" htmlFor="reset-new-password">
              Новый пароль
            </label>

            <div className="auth-input-wrap">
              <input
                id="reset-new-password"
                className="auth-input auth-input-with-action"
                type={showNewPassword ? "text" : "password"}
                placeholder="Минимум 8 символов"
                value={form.newPassword}
                onChange={(e) => updateField("newPassword", e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />

              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowNewPassword((prev) => !prev)}
                aria-label={showNewPassword ? "Скрыть пароль" : "Показать пароль"}
                title={showNewPassword ? "Скрыть пароль" : "Показать пароль"}
              >
                {showNewPassword ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          <div className="auth-row">
            <label className="auth-label" htmlFor="reset-confirm-password">
              Повторите новый пароль
            </label>

            <div className="auth-input-wrap">
              <input
                id="reset-confirm-password"
                className="auth-input auth-input-with-action"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Введите пароль ещё раз"
                value={form.confirmPassword}
                onChange={(e) => updateField("confirmPassword", e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />

              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={
                  showConfirmPassword ? "Скрыть пароль" : "Показать пароль"
                }
                title={showConfirmPassword ? "Скрыть пароль" : "Показать пароль"}
              >
                {showConfirmPassword ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          <div className="auth-password-check-card">
            <div className="auth-password-check-header">
              Требования к новому паролю
            </div>

            <div
              className={`auth-password-rule ${passwordChecks.length ? "is-valid" : ""}`}
            >
              <span className="auth-password-rule-icon">
                {passwordChecks.length ? "✓" : ""}
              </span>
              Минимум 8 символов
            </div>

            <div
              className={`auth-password-rule ${passwordChecks.upper ? "is-valid" : ""}`}
            >
              <span className="auth-password-rule-icon">
                {passwordChecks.upper ? "✓" : ""}
              </span>
              Есть заглавная буква
            </div>

            <div
              className={`auth-password-rule ${passwordChecks.lower ? "is-valid" : ""}`}
            >
              <span className="auth-password-rule-icon">
                {passwordChecks.lower ? "✓" : ""}
              </span>
              Есть строчная буква
            </div>

            <div
              className={`auth-password-rule ${passwordChecks.digit ? "is-valid" : ""}`}
            >
              <span className="auth-password-rule-icon">
                {passwordChecks.digit ? "✓" : ""}
              </span>
              Есть цифра
            </div>

            <div
              className={`auth-password-rule ${passwordChecks.match ? "is-valid" : ""}`}
            >
              <span className="auth-password-rule-icon">
                {passwordChecks.match ? "✓" : ""}
              </span>
              Пароли совпадают
            </div>
          </div>

          {error && <div className="auth-alert auth-alert-error">{error}</div>}
          {info && <div className="auth-alert auth-alert-success">{info}</div>}

          <button
            className="auth-button"
            type="submit"
            disabled={isSubmitting || !isPasswordValid}
          >
            {isSubmitting ? "Меняем пароль..." : "Изменить пароль"}
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
          Уже изменили пароль? <Link to="/login">Перейти ко входу</Link>
        </div>
      </section>
    </div>
  );
}