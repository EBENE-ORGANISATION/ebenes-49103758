import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Auth from "./pages/Auth.tsx";
import AdminUsers from "./pages/AdminUsers.tsx";
import AuditLog from "./pages/AuditLog.tsx";
import ParametresSociete from "./pages/ParametresSociete.tsx";
import SuperAdmin from "./pages/SuperAdmin.tsx";
import Bulletins from "./pages/Bulletins.tsx";
import Corbeille from "./pages/Corbeille.tsx";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SuperAdminRoute } from "@/components/SuperAdminRoute";
import { ForceChangePasswordGate } from "@/components/auth/ForceChangePasswordGate";

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
        </AuthProvider>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
