import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register as registerRequest } from "../api/authApi";
import "../styles/auth.css";

export default function RegisterPageQ() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    userName: "",
    email: "",
    password: "",
    confirmPassword: "",
    region: "",
    userAgreementAccepted: false,
    personalDataConsent: false,
    personalDataDistributionConsent: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordChecks = {
    length: form.password.length >= 8,
    upper: /[A-ZА-ЯЁ]/.test(form.password),
    lower: /[a-zа-яё]/.test(form.password),
    digit: /\d/.test(form.password),
    match: form.password.length > 0 && form.password === form.confirmPassword,
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

  function normalizeUserName(value) {
    return value.trim().replace(/^@/, "").toLowerCase();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const email = form.email.trim();
    const userName = normalizeUserName(form.userName);

    if (!form.firstName.trim()) {
      setError("Введите имя.");
      return;
    }

    if (!/^[a-zA-Z0-9._]+$/.test(userName)) {
      setError("Имя пользователя может содержать только латинские буквы, цифры, точку и нижнее подчёркивание.");
      return;
    }

    if (!isPasswordValid) {
      setError("Проверьте требования к паролю.");
      return;
    }

    if (!form.userAgreementAccepted) {
      setError("Для регистрации необходимо принять пользовательское соглашение.");
      return;
    }

    if (!form.personalDataConsent) {
      setError("Для регистрации необходимо согласие на обработку персональных данных.");
      return;
    }

    if (!form.personalDataDistributionConsent) {
      setError("Для регистрации необходимо согласие на обработку данных, разрешенных для распространения.");
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await registerRequest({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || null,
        userName,
        email,
        password: form.password,
        region: form.region.trim() || null,
        userAgreementAccepted: form.userAgreementAccepted,
        userAgreementVersion: "2026-05-30",
        personalDataConsentAccepted: form.personalDataConsent,
        personalDataConsentVersion: "2026-05-30",
        personalDataDistributionConsentAccepted: form.personalDataDistributionConsent,
        personalDataDistributionConsentVersion: "2026-05-30",
      });

      navigate(`/confirm-email?email=${encodeURIComponent(response?.email || email)}`, {
        state: {
          email: response?.email || email,
          fromRegister: true,
        },
      });
    } catch (err) {
      console.error(err);
      setError(`Не удалось зарегистрироваться: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-card auth-card-wide">
        <div className="auth-header">
          
          <h1 className="auth-title">Создание аккаунта</h1>

          <p className="auth-subtitle">
            Укажите имя, фамилию и имя пользователя. После регистрации мы отправим
            код подтверждения на email.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-row">
            <label className="auth-label" htmlFor="register-first-name">
              Имя
            </label>
            <input
              id="register-first-name"
              className="auth-input"
              placeholder="Например, Дмитрий"
              value={form.firstName}
              onChange={(e) => updateField("firstName", e.target.value)}
              required
              minLength={2}
              maxLength={50}
              autoComplete="given-name"
            />
          </div>

          <div className="auth-row">
            <label className="auth-label" htmlFor="register-last-name">
              Фамилия
            </label>
            <input
              id="register-last-name"
              className="auth-input"
              placeholder="Например, Иванов"
              value={form.lastName}
              onChange={(e) => updateField("lastName", e.target.value)}
              maxLength={50}
              autoComplete="family-name"
            />
          </div>

          <div className="auth-row">
            <label className="auth-label" htmlFor="register-user-name">
              Имя пользователя
            </label>
            <div className="auth-input-prefix-wrap">
              <span>@</span>
              <input
                id="register-user-name"
                className="auth-input auth-input-with-prefix"
                placeholder="dmitry_22"
                value={form.userName}
                onChange={(e) => updateField("userName", e.target.value)}
                required
                minLength={3}
                maxLength={30}
                autoComplete="username"
              />
            </div>
            <div className="auth-field-hint">
              По нему вас смогут найти другие пользователи. Только латинские буквы,
              цифры, точка и нижнее подчёркивание.
            </div>
          </div>

          <div className="auth-row">
            <label className="auth-label" htmlFor="register-email">
              Email
            </label>
            <input
              id="register-email"
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
            <label className="auth-label" htmlFor="register-password">
              Пароль
            </label>

            <div className="auth-input-wrap">
              <input
                id="register-password"
                className="auth-input auth-input-with-action"
                type={showPassword ? "text" : "password"}
                placeholder="Введите пароль"
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
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
          </div>

          <div className="auth-row">
            <label className="auth-label" htmlFor="register-confirm-password">
              Повторите пароль
            </label>

            <div className="auth-input-wrap">
              <input
                id="register-confirm-password"
                className="auth-input auth-input-with-action"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Повторите пароль"
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
                aria-label={showConfirmPassword ? "Скрыть пароль" : "Показать пароль"}
                title={showConfirmPassword ? "Скрыть пароль" : "Показать пароль"}
              >
                {showConfirmPassword ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          <div className="auth-password-check-card">
            <div className="auth-password-check-header">Требования к паролю</div>

            <PasswordRule checked={passwordChecks.length}>
              Минимум 8 символов
            </PasswordRule>

            <PasswordRule checked={passwordChecks.upper}>
              Заглавная буква
            </PasswordRule>

            <PasswordRule checked={passwordChecks.lower}>
              Строчная буква
            </PasswordRule>

            <PasswordRule checked={passwordChecks.digit}>
              Цифра
            </PasswordRule>

            <PasswordRule checked={passwordChecks.match}>
              Пароли совпадают
            </PasswordRule>
          </div>

          <div className="auth-row">
            <label className="auth-label" htmlFor="register-region">
              Регион
            </label>
            <input
              id="register-region"
              className="auth-input"
              placeholder="Например, Новосибирск"
              value={form.region}
              onChange={(e) => updateField("region", e.target.value)}
              maxLength={100}
            />
          </div>

          <div className="auth-consents-stack">
            <label className="auth-consent-card">
              <input
                type="checkbox"
                checked={form.userAgreementAccepted}
                onChange={(e) => updateField("userAgreementAccepted", e.target.checked)}
                required
              />

              <span>
                Я принимаю{" "}
                <Link to="/terms" target="_blank" rel="noopener noreferrer">
                  Пользовательское соглашение
                </Link>.
              </span>
            </label>

            <label className="auth-consent-card">
              <input
                type="checkbox"
                checked={form.personalDataConsent}
                onChange={(e) => updateField("personalDataConsent", e.target.checked)}
                required
              />

              <span>
                Я даю согласие на обработку персональных данных и подтверждаю, что ознакомлен с{" "}
                <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer">
                  Политикой обработки персональных данных
                </Link>{" "}
                и{" "}
                <Link to="/personal-data-consent" target="_blank" rel="noopener noreferrer">
                  Согласием на обработку персональных данных
                </Link>.
              </span>
            </label>

            <label className="auth-consent-card">
              <input
                type="checkbox"
                checked={form.personalDataDistributionConsent}
                onChange={(e) => updateField("personalDataDistributionConsent", e.target.checked)}
                required
              />

              <span>
                Я понимаю, что данные открытого профиля, публикации, комментарии и другие публичные действия могут быть видны другим пользователям, и даю согласие на их размещение в приложении. Текст отдельного согласия доступен{" "}
                <Link to="/personal-data-distribution-consent" target="_blank" rel="noopener noreferrer">
                  на отдельной странице
                </Link>.
              </span>
            </label>
          </div>

          <div className="auth-hint">
            Вход будет доступен только после подтверждения email.
          </div>

          {error && <div className="auth-alert auth-alert-error">{error}</div>}

          <button
            className="auth-button"
            type="submit"
            disabled={
              isSubmitting ||
              !isPasswordValid ||
              !form.userAgreementAccepted ||
              !form.personalDataConsent ||
              !form.personalDataDistributionConsent
            }
          >
            {isSubmitting ? "Создаём аккаунт..." : "Зарегистрироваться"}
          </button>
        </form>

        <div className="auth-footer">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </div>

        <div className="auth-legal-links" aria-label="Юридические документы">
          <Link to="/terms">Пользовательское соглашение</Link>
          <Link to="/privacy-policy">Политика обработки данных</Link>
          <Link to="/personal-data-consent">Согласие на обработку данных</Link>
          <Link to="/personal-data-distribution-consent">Согласие на распространение данных</Link>
        </div>
      </section>
    </div>
  );
}

function PasswordRule({ checked, children }) {
  return (
    <div className={`auth-password-rule ${checked ? "is-valid" : ""}`}>
      <span className="auth-password-rule-icon">{checked ? "✓" : ""}</span>
      <span>{children}</span>
    </div>
  );
}
