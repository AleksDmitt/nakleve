import { createBrowserRouter, Navigate } from "react-router-dom";
import Layout from "../components/Layout";
import ProtectedRoute from "../components/ProtectedRoute";
import PublicRoute from "../components/PublicRoute";
import LoginPage from "../pages/LoginPage";
import RegisterPage from "../pages/RegisterPage";
import ProfilePage from "../pages/ProfilePage";
import UserProfilePage from "../pages/UserProfilePage";
import FishingEntriesPage from "../pages/FishingEntriesPage";
import MapPointsPage from "../pages/MapPointsPage";
import CompanionsPage from "../pages/CompanionsPage";
import WeatherPage from "../pages/WeatherPage";
import ChatsPage from "../pages/ChatsPage";
import FeedPage from "../pages/FeedPage";
import ChatDetailsPage from "../pages/ChatDetailsPage";
import ConfirmEmailPage from "../pages/ConfirmEmailPage";
import ForgotPasswordPage from "../pages/ForgotPasswordPage";
import ResetPasswordPage from "../pages/ResetPasswordPage";
import PrivacyPolicyPage from "../pages/PrivacyPolicyPage";
import PersonalDataConsentPage from "../pages/PersonalDataConsentPage";
import PersonalDataDistributionConsentPage from "../pages/PersonalDataDistributionConsentPage";
import UserAgreementPage from "../pages/UserAgreementPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <Layout>
        <FeedPage />
      </Layout>
    ),
  },

  {
    path: "/feed",
    element: (
      <Layout>
        <FeedPage />
      </Layout>
    ),
  },

  {
    path: "/login",
    element: (
      <PublicRoute>
        <Layout>
          <LoginPage />
        </Layout>
      </PublicRoute>
    ),
  },

  {
  path: "/confirm-email",
  element: (
    <PublicRoute>
      <Layout>
        <ConfirmEmailPage />
      </Layout>
    </PublicRoute>
  ),
},

  {
    path: "/register",
    element: (
      <PublicRoute>
        <Layout>
          <RegisterPage />
        </Layout>
      </PublicRoute>
    ),
  },

  {
  path: "/forgot-password",
  element: (
    <PublicRoute>
      <Layout>
        <ForgotPasswordPage />
      </Layout>
    </PublicRoute>
  ),
},

{
  path: "/reset-password",
  element: (
    <PublicRoute>
      <Layout>
        <ResetPasswordPage />
      </Layout>
    </PublicRoute>
  ),
},

  {
    path: "/terms",
    element: (
      <Layout>
        <UserAgreementPage />
      </Layout>
    ),
  },

  {
    path: "/user-agreement",
    element: <Navigate to="/terms" replace />,
  },

  {
    path: "/privacy-policy",
    element: (
      <Layout>
        <PrivacyPolicyPage />
      </Layout>
    ),
  },

  {
    path: "/privacy",
    element: <Navigate to="/privacy-policy" replace />,
  },

  {
    path: "/personal-data-consent",
    element: (
      <Layout>
        <PersonalDataConsentPage />
      </Layout>
    ),
  },

  {
    path: "/personal-data-distribution-consent",
    element: (
      <Layout>
        <PersonalDataDistributionConsentPage />
      </Layout>
    ),
  },

  {
    path: "/profile",
    element: (
      <ProtectedRoute>
        <Layout>
          <ProfilePage />
        </Layout>
      </ProtectedRoute>
    ),
  },

  {
    path: "/users/:id",
    element: (
      <ProtectedRoute>
        <Layout>
          <UserProfilePage />
        </Layout>
      </ProtectedRoute>
    ),
  },

  {
    path: "/fishing-entries",
    element: (
      <ProtectedRoute>
        <Layout>
          <FishingEntriesPage />
        </Layout>
      </ProtectedRoute>
    ),
  },

  {
    path: "/map-points",
    element: (
      <ProtectedRoute>
        <Layout>
          <MapPointsPage />
        </Layout>
      </ProtectedRoute>
    ),
  },

  {
    path: "/companions",
    element: (
      <ProtectedRoute>
        <Layout>
          <CompanionsPage />
        </Layout>
      </ProtectedRoute>
    ),
  },

  {
    path: "/weather",
    element: (
      <ProtectedRoute>
        <Layout>
          <WeatherPage />
        </Layout>
      </ProtectedRoute>
    ),
  },

  {
    path: "/chats",
    element: (
      <ProtectedRoute>
        <Layout>
          <ChatsPage />
        </Layout>
      </ProtectedRoute>
    ),
  },

  {
    path: "/chats/:chatId/details",
    element: (
      <ProtectedRoute>
        <Layout>
          <ChatDetailsPage />
        </Layout>
      </ProtectedRoute>
    ),
  },

  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);