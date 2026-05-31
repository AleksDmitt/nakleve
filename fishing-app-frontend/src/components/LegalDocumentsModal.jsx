import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { acceptLegalDocuments, getMe } from "../api/authApi";
import { useAuth } from "../context/AuthContext";

const FALLBACK_USER_AGREEMENT_VERSION = "2026-05-30";
const FALLBACK_PERSONAL_DATA_CONSENT_VERSION = "2026-05-30";
const FALLBACK_PERSONAL_DATA_DISTRIBUTION_CONSENT_VERSION = "2026-05-30";

const LEGAL_PATHS = new Set([
  "/terms",
  "/user-agreement",
  "/privacy",
  "/privacy-policy",
  "/personal-data-consent",
  "/personal-data-distribution-consent",
]);

function getCurrentVersions(user) {
  return {
    userAgreementVersion:
      user?.currentUserAgreementVersion || FALLBACK_USER_AGREEMENT_VERSION,
    personalDataConsentVersion:
      user?.currentPersonalDataConsentVersion || FALLBACK_PERSONAL_DATA_CONSENT_VERSION,
    personalDataDistributionConsentVersion:
      user?.currentPersonalDataDistributionConsentVersion ||
      FALLBACK_PERSONAL_DATA_DISTRIBUTION_CONSENT_VERSION,
  };
}

function needsLegalDocuments(user) {
  if (!user) return false;

  if (user.legalDocumentsRequired === true) return true;
  if (user.legalDocumentsAccepted === true) return false;

  const hasLegalFields =
    Object.prototype.hasOwnProperty.call(user, "userAgreementAccepted") ||
    Object.prototype.hasOwnProperty.call(user, "personalDataConsentAccepted") ||
    Object.prototype.hasOwnProperty.call(user, "personalDataDistributionConsentAccepted");

  if (!hasLegalFields) return false;

  const versions = getCurrentVersions(user);

  return user.userAgreementAccepted !== true ||
    user.userAgreementVersion !== versions.userAgreementVersion ||
    user.personalDataConsentAccepted !== true ||
    user.personalDataConsentVersion !== versions.personalDataConsentVersion ||
    user.personalDataDistributionConsentAccepted !== true ||
    user.personalDataDistributionConsentVersion !== versions.personalDataDistributionConsentVersion;
}

function markLegalDocumentsAccepted(user, versions) {
  return {
    ...(user || {}),
    userAgreementAccepted: true,
    userAgreementVersion: versions.userAgreementVersion,
    personalDataConsentAccepted: true,
    personalDataConsentVersion: versions.personalDataConsentVersion,
    personalDataDistributionConsentAccepted: true,
    personalDataDistributionConsentVersion: versions.personalDataDistributionConsentVersion,
    legalDocumentsAccepted: true,
    legalDocumentsRequired: false,
    currentUserAgreementVersion: versions.userAgreementVersion,
    currentPersonalDataConsentVersion: versions.personalDataConsentVersion,
    currentPersonalDataDistributionConsentVersion: versions.personalDataDistributionConsentVersion,
  };
}

export default function LegalDocumentsModal() {
  const location = useLocation();
  const { user, setUser, logout } = useAuth();

  const [form, setForm] = useState({
    userAgreementAccepted: false,
    personalDataConsentAccepted: false,
    personalDataDistributionConsentAccepted: false,
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const versions = useMemo(() => getCurrentVersions(user), [user]);
  const isLegalPage = LEGAL_PATHS.has(location.pathname);
  const shouldShow = !isLegalPage && needsLegalDocuments(user);

  if (!shouldShow) return null;

  const allAccepted =
    form.userAgreementAccepted &&
    form.personalDataConsentAccepted &&
    form.personalDataDistributionConsentAccepted;

  function updateField(field, value) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!allAccepted) {
      setError("Чтобы продолжить пользоваться приложением, примите все документы.");
      return;
    }

    try {
      setIsSubmitting(true);

      const updatedUser = await acceptLegalDocuments({
        userAgreementAccepted: form.userAgreementAccepted,
        userAgreementVersion: versions.userAgreementVersion,
        personalDataConsentAccepted: form.personalDataConsentAccepted,
        personalDataConsentVersion: versions.personalDataConsentVersion,
        personalDataDistributionConsentAccepted: form.personalDataDistributionConsentAccepted,
        personalDataDistributionConsentVersion: versions.personalDataDistributionConsentVersion,
      });

      let freshUser = updatedUser;

      try {
        freshUser = await getMe();
      } catch (refreshError) {
        console.warn("Legal documents accepted, but user refresh failed:", refreshError);
      }

      setUser(freshUser);

      if (needsLegalDocuments(freshUser)) {
        setError(
          "Запрос отправлен, но backend всё ещё возвращает, что документы не приняты. Проверь, применена ли миграция и заменён ли AuthController.cs."
        );
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Не удалось сохранить принятие документов.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="legal-consent-modal-backdrop" role="presentation">
      <section
        className="legal-consent-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-consent-modal-title"
      >
        <div className="legal-consent-modal__header">
          <p className="legal-consent-modal__kicker">НаКлёве</p>
          <h2 id="legal-consent-modal-title">Обновлены юридические документы</h2>
          <p>
            Для продолжения использования приложения необходимо подтвердить актуальные документы.
            Это нужно для корректной фиксации согласий в аккаунте.
          </p>
        </div>

        <form className="legal-consent-modal__form" onSubmit={handleSubmit}>
          <label className="legal-consent-modal__check">
            <input
              type="checkbox"
              checked={form.userAgreementAccepted}
              onChange={(event) => updateField("userAgreementAccepted", event.target.checked)}
            />
            <span>
              Я принимаю{" "}
              <Link to="/terms" target="_blank" rel="noopener noreferrer">
                Пользовательское соглашение
              </Link>.
            </span>
          </label>

          <label className="legal-consent-modal__check">
            <input
              type="checkbox"
              checked={form.personalDataConsentAccepted}
              onChange={(event) => updateField("personalDataConsentAccepted", event.target.checked)}
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

          <label className="legal-consent-modal__check">
            <input
              type="checkbox"
              checked={form.personalDataDistributionConsentAccepted}
              onChange={(event) => updateField("personalDataDistributionConsentAccepted", event.target.checked)}
            />
            <span>
              Я понимаю, что данные открытого профиля, публикации, комментарии и другие публичные действия могут быть видны другим пользователям,
              и даю согласие на их размещение в приложении. Текст отдельного согласия доступен{" "}
              <Link to="/personal-data-distribution-consent" target="_blank" rel="noopener noreferrer">
                на отдельной странице
              </Link>.
            </span>
          </label>

          {error && <div className="legal-consent-modal__error">{error}</div>}

          <div className="legal-consent-modal__actions">
            <button
              className="legal-consent-modal__secondary"
              type="button"
              onClick={logout}
              disabled={isSubmitting}
            >
              Выйти
            </button>

            <button
              className="legal-consent-modal__primary"
              type="submit"
              disabled={!allAccepted || isSubmitting}
            >
              {isSubmitting ? "Сохраняем..." : "Принять и продолжить"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
