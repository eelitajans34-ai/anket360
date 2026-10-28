import { createBrowserRouter, Outlet, RouterProvider, type RouteObject } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { GuestOnly, RequireAuth, RequireOrg } from "@/components/RouteGuards";
import HomePage from "@/pages/HomePage";
import LoginPage from "@/pages/auth/LoginPage";
import SignupPage from "@/pages/auth/SignupPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import CreateOrgPage from "@/pages/CreateOrgPage";
import PanelLayout from "@/pages/panel/PanelLayout";
import DashboardPage from "@/pages/panel/DashboardPage";
import SurveysPage from "@/pages/panel/SurveysPage";
import SurveyBuilderPage from "@/pages/panel/SurveyBuilderPage";
import OrgSettingsPage from "@/pages/panel/OrgSettingsPage";
import ProfilePage from "@/pages/panel/ProfilePage";
import NotFoundPage from "@/pages/NotFoundPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import InvitePage from "@/pages/InvitePage";

function Root() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

export const routes: RouteObject[] = [
  {
    element: <Root />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/sifre-yenile", element: <ResetPasswordPage /> },
      { path: "/davet/:token", element: <InvitePage /> },
      {
        element: <GuestOnly />,
        children: [
          { path: "/giris", element: <LoginPage /> },
          { path: "/kayit", element: <SignupPage /> },
          { path: "/sifremi-unuttum", element: <ForgotPasswordPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          { path: "/kurum/olustur", element: <CreateOrgPage /> },
          {
            element: <RequireOrg />,
            children: [
              {
                path: "/panel",
                element: <PanelLayout />,
                children: [
                  { index: true, element: <DashboardPage /> },
                  { path: "anketler", element: <SurveysPage /> },
                  { path: "anketler/yeni", element: <SurveyBuilderPage key="yeni" /> },
                  { path: "anketler/:id/duzenle", element: <SurveyBuilderPage /> },
                  { path: "kurum", element: <OrgSettingsPage /> },
                  { path: "profil", element: <ProfilePage /> },
                ],
              },
            ],
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const routerFuture = {
  v7_relativeSplatPath: true,
  v7_fetcherPersist: true,
  v7_normalizeFormMethod: true,
  v7_partialHydration: true,
  v7_skipActionErrorRevalidation: true,
} as const;

const router = createBrowserRouter(routes, { future: routerFuture, basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/" });

export default function App() {
  return <RouterProvider router={router} future={{ v7_startTransition: true }} />;
}
