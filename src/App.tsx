import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";

// Pages secondaires : chargées seulement quand on y navigue
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const AdminUsers = lazy(() => import("./pages/AdminUsers.tsx"));
const AuditLog = lazy(() => import("./pages/AuditLog.tsx"));
const ParametresSociete = lazy(() => import("./pages/ParametresSociete.tsx"));
const SuperAdmin = lazy(() => import("./pages/SuperAdmin.tsx"));
const Bulletins = lazy(() => import("./pages/Bulletins.tsx"));
const Corbeille = lazy(() => import("./pages/Corbeille.tsx"));
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SuperAdminRoute } from "@/components/SuperAdminRoute";
import { ForceChangePasswordGate } from "@/components/auth/ForceChangePasswordGate";
import { MfaGate } from "@/components/auth/MfaGate";
import { MfaEnrollRequiredGate } from "@/components/auth/MfaEnrollRequiredGate";
import { AndroidUpdateChecker } from "@/components/AndroidUpdateChecker";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner
        position="bottom-right"
        toastOptions={{
          duration: 3000,
          classNames: {
            toast: "font-sans text-sm",
            success: "border-l-4 border-success",
            error: "border-l-4 border-destructive",
            warning: "border-l-4 border-warning",
            info: "border-l-4 border-info",
          },
        }}
      />
      <HashRouter>
        <AuthProvider>
          <ForceChangePasswordGate />
          <MfaGate />
          <MfaEnrollRequiredGate />
          <AndroidUpdateChecker />
          <Suspense fallback={null}>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute requireRoles={["admin"]}>
                  <AdminUsers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/audit"
              element={
                <ProtectedRoute requireRoles={["admin"]}>
                  <AuditLog />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/societe"
              element={
                <ProtectedRoute requireRoles={["admin"]}>
                  <ParametresSociete />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bulletins"
              element={
                <ProtectedRoute>
                  <Bulletins />
                </ProtectedRoute>
              }
            />
            <Route
              path="/super-admin"
              element={
                <SuperAdminRoute>
                  <SuperAdmin />
                </SuperAdminRoute>
              }
            />
            <Route
              path="/corbeille"
              element={
                <ProtectedRoute>
                  <Corbeille />
                </ProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
