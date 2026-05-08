import { CourseCard } from "@/components/attendance/course-card";
import { Skeleton } from "@/components/ui/skeleton";
import { m as motion } from "framer-motion";
import { Plus } from "lucide-react";

interface CourseGridProps {
  isLoadingCourses: boolean;
  isLoadingAllCourseSummaries: boolean;
  sortedCourses: any[];
  customInstructors: any[];
  allCourseSummaries: any;
  profile: any;
  onEditInstructor: (course: any, instructorName: string, hasCustomName: boolean, customInstructor: any) => void;
  onAddCourse: () => void;
}

export function CourseGrid({
  isLoadingCourses,
  isLoadingAllCourseSummaries,
  sortedCourses,
  customInstructors,
  allCourseSummaries,
  profile,
  onEditInstructor,
  onAddCourse,
}: CourseGridProps) {
  return (
    <div className="mb-6 mt-10">
      <div className="mb-6 flex flex-col justify-center items-center mx-3">
        <h2 className="text-lg font-bold mb-0.5 italic">
          Your Courses Lineup <span className="ml-1">⬇️📚</span>
        </h2>
        <p className="italic text-muted-foreground text-sm text-center">
          Your current courses — organized for easy access.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {isLoadingCourses
          ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={`skeleton-course-${i}`}>
                <Skeleton className="h-70 w-full rounded-2xl" />
              </div>
            ))
          )
          : sortedCourses.length > 0
          ? (
            <>
              {sortedCourses.map((course: any) => {
                const courseCodeNormalized =
                  (course.code || String(course.id))
                    .toUpperCase().replace(/\s+/g, "");
                const customInstructor = customInstructors
                  ?.find(
                    (ci) => ci.course_code === courseCodeNormalized,
                  );

                const ezygoInstructors =
                  course.institution_users?.filter((
                    user: any,
                  ) => user.pivot.courserole_id === 1) || [];

                const hasCustomName = !!customInstructor
                  ?.instructor_name;
                const instructorName = hasCustomName
                  ? (customInstructor.instructor_name ?? undefined)
                  : ezygoInstructors.length > 0
                  ? `${ezygoInstructors[0].first_name} ${
                    ezygoInstructors[0].last_name
                  }`
                  : undefined;

                return (
                  <div key={course.key}>
                    <CourseCard
                      course={course}
                      initialCourseDetails={allCourseSummaries
                        ?.[course.code || ""]}
                      isBatchLoading={isLoadingAllCourseSummaries}
                      instructorName={instructorName}
                      hasCustomInstructor={hasCustomName}
                      supabaseUserId={profile?.auth_id ?? undefined}
                      onEditInstructor={() => onEditInstructor(course, instructorName || "", hasCustomName, customInstructor)}
                    />
                  </div>
                );
              })}

              {/* Aesthetic "Add New Course" Card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onAddCourse}
                className="group relative cursor-pointer min-h-75 rounded-xl border-2 border-dashed border-border/80 hover:border-primary/50 bg-accent/10 hover:bg-primary/5 transition-all duration-300 flex flex-col items-center justify-center p-8 text-center"
              >
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <Plus className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">
                  Can&apos;t find a course?
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-50">
                  Add it manually to start tracking your attendance
                  immediately.
                </p>
                <div className="absolute inset-0 rounded-xl bg-linear-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </motion.div>
            </>
          )
          : (
            <div className="col-span-full text-center py-12 bg-accent/30 rounded-2xl border-2 border-dashed border-border/60">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Plus className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">No courses found</h3>
              <p className="text-muted-foreground mb-6 max-w-xs mx-auto">
                Sync your profile or add courses manually to get started.
              </p>
              <button
                onClick={onAddCourse}
                className="px-6 py-2.5 bg-primary text-white rounded-lg font-bold hover:bg-primary/90 transition-colors"
              >
                Add Your First Course
              </button>
            </div>
          )}
      </div>
    </div>
  );
}

