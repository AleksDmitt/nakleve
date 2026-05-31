import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { forgotPassword } from "../api/authApi";
import "../styles/auth.css";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setInfo("");

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setError("Введите email.");
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await forgotPassword({
        email: normalizedEmail,
      });

      setInfo(response?.message || "Если аккаунт существует, мы отправили код.");

      navigate(`/reset-password?email=${encodeURIComponent(normalizedEmail)}`, {
        state: {
          email: normalizedEmail,
        },
      });
    } catch (err) {
      console.error(err);
      setError(err.message || "Не удалось отправить код восстановления.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="auth-header">
          <div className="auth-badge">🔑 Восстановление доступа</div>

          <h1 className="auth-title">Забыли пароль?</h1>

          <p className="auth-subtitle">
            Введите email от аккаунта. Мы отправим код восстановления, если такой
            аккаунт существует.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-row">
            <label className="auth-label" htmlFor="forgot-email">
              Email
            </label>
            <input
              id="forgot-email"
              className="auth-input"
              type="email"
              placeholder="example@yandex.ru"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="auth-hint">
            Для безопасности мы не показываем, существует ли аккаунт с указанным
            email.
          </div>

          {error && <div className="auth-alert auth-alert-error">{error}</div>}
          {info && <div className="auth-alert auth-alert-success">{info}</div>}

          <button className="auth-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Отправляем код..." : "Отправить код"}
          </button>
        </form>

        <div className="auth-footer">
          Вспомнили пароль? <Link to="/login">Вернуться ко входу</Link>
        </div>
      </section>
    </div>
  );
}