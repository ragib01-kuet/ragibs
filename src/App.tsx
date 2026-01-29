import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthProvider";
import Index from "./pages/Index";
import Courses from "./pages/Courses";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import AdminInvites from "./pages/AdminInvites";
import AdminTeacherRequests from "./pages/AdminTeacherRequests";
import AdminDashboard from "./pages/AdminDashboard";
import AdminLogin from "./pages/AdminLogin";
import CourseDetail from "./pages/CourseDetail";
import VideoPage from "./pages/VideoPage";
import TeacherStudio from "./pages/TeacherStudio";
import TeacherCourseManage from "./pages/TeacherCourseManage";
import TeacherVideoTimeline from "./pages/TeacherVideoTimeline";
import TeacherAnalytics from "./pages/TeacherAnalytics";
import SimulationViewer from "./pages/SimulationViewer";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/courses" element={<Courses />} />
            <Route path="/courses/:courseId" element={<CourseDetail />} />
            <Route path="/courses/:courseId/videos/:videoId" element={<VideoPage />} />
            <Route path="/simulations/view" element={<SimulationViewer />} />
            <Route path="/studio" element={<TeacherStudio />} />
            <Route path="/studio/analytics" element={<TeacherAnalytics />} />
            <Route path="/studio/courses/:courseId" element={<TeacherCourseManage />} />
            <Route path="/studio/courses/:courseId/videos/:videoId/timeline" element={<TeacherVideoTimeline />} />
            <Route path="/login" element={<Login />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin" element={<AdminDashboard />} />
             <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/invites" element={<AdminInvites />} />
            <Route path="/admin/teacher-requests" element={<AdminTeacherRequests />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
