import { useState, useEffect, useRef } from 'react';
import type { BrightspaceCourse } from '@wolfie/shared';
import Sprite from '../../../../../../design/Sprite';

interface Course {
  id: string;
  code: string;
  name: string;
  dueSoon: number;
  visible: boolean;
}

interface BrightspaceScreenProps {
  onNext: (data: {
    brightspaceConnected: boolean;
    semester: string;
    courses: Course[];
    assignments: number;
  }) => void;
  onBack: () => void;
}

export function BrightspaceScreen({ onNext, onBack }: BrightspaceScreenProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [semester, setSemester] = useState('Fall 2026');
  const [fetchStage, setFetchStage] = useState(0); // 0 = waiting, 1-5 = stages
  const [assignmentsProgress, setAssignmentsProgress] = useState(0);
  const [totalAssignments, setTotalAssignments] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  // Check if data already exists on mount
  useEffect(() => {
    const checkExistingData = async () => {
      try {
        const brightspaceCourses = await window.electronAPI.invoke('brightspace-get-courses') as BrightspaceCourse[];

        if (brightspaceCourses.length > 0) {
          console.log('[BrightspaceScreen] Found existing data:', brightspaceCourses.length, 'courses');
          await loadData();
        }
      } catch (error) {
        console.error('[BrightspaceScreen] Failed to check existing data:', error);
      }
    };

    void checkExistingData();

    // Cleanup on unmount
    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
      }
    };
  }, []);

  const loadData = async () => {
    try {
      // Stage 1: Signed in to Brightspace
      setFetchStage(1);
      await new Promise(resolve => setTimeout(resolve, 400));

      // Stage 2: Fetch semester
      const currentSemester = await window.electronAPI.invoke('brightspace-get-semester') as string | null;

      if (currentSemester) {
        setSemester(currentSemester);
      }
      setFetchStage(2);
      await new Promise(resolve => setTimeout(resolve, 400));

      // Stage 3: Fetch and filter courses by current semester
      const allCourses = await window.electronAPI.invoke('brightspace-get-courses') as BrightspaceCourse[];

      console.log('[BrightspaceScreen] All courses:', allCourses);
      console.log('[BrightspaceScreen] Current semester:', currentSemester);

      // Debug: log each course's semester
      allCourses.forEach((course, index) => {
        console.log(`[BrightspaceScreen] Course ${index}: ${course.code} - semester: "${course.semester}"`);
      });

      // Filter to only show courses from the current semester
      let semesterCourses = allCourses;

      if (currentSemester && allCourses.some(c => c.semester)) {
        // We have semester info - filter strictly
        semesterCourses = allCourses.filter(course => {
          // Only include courses that match current semester
          // Exclude courses with semester info that doesn't match
          if (course.semester) {
            const matches = course.semester === currentSemester;
            console.log(`[BrightspaceScreen] Course ${course.code}: semester="${course.semester}", currentSemester="${currentSemester}", matches=${matches}`);
            return matches;
          } else {
            // Course has no semester info - include it (likely current)
            console.log(`[BrightspaceScreen] Course ${course.code}: no semester info, including by default`);
            return true;
          }
        });
      }

      console.log('[BrightspaceScreen] Filtered courses:', semesterCourses.length, 'of', allCourses.length);
      console.log('[BrightspaceScreen] Excluded courses:', allCourses.length - semesterCourses.length);

      const transformedCourses: Course[] = semesterCourses.map(course => ({
        id: course.id,
        code: course.code,
        name: course.name,
        dueSoon: course.assignments?.length || 0,
        visible: true
      }));

      setCourses(transformedCourses);
      setFetchStage(3);
      await new Promise(resolve => setTimeout(resolve, 400));

      // Stage 4-5: Animate assignments loading
      const total = transformedCourses.reduce((sum, c) => sum + c.dueSoon, 0);
      setTotalAssignments(total);
      setFetchStage(4);

      // Animate counting up assignments
      if (total > 0) {
        const steps = 15;
        const increment = total / steps;
        let progress = 0;

        for (let i = 0; i < steps; i++) {
          progress = Math.min(total, Math.ceil(progress + increment));
          setAssignmentsProgress(progress);
          await new Promise(resolve => setTimeout(resolve, 80));
        }
      }

      setAssignmentsProgress(total);
      setFetchStage(5);

      // Stop polling
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
      }
    } catch (error) {
      console.error('[BrightspaceScreen] Failed to load data:', error);
    }
  };

  const handleOpenBrightspace = async () => {
    // Open Brightspace in default browser (Chrome, not Electron)
    const brightspaceUrl = 'https://brightspace.stonybrook.edu/';
    try {
      await window.electronAPI.invoke('open-external', brightspaceUrl);
      setIsPolling(true);
    } catch (error) {
      console.error('[BrightspaceScreen] Failed to open Brightspace:', error);
      return;
    }

    // Start polling for data
    pollingInterval.current = setInterval(async () => {
      try {
        const brightspaceCourses = await window.electronAPI.invoke('brightspace-get-courses') as BrightspaceCourse[];

        if (brightspaceCourses.length > 0) {
          setIsPolling(false);
          await loadData();
        }
      } catch (error) {
        console.error('[BrightspaceScreen] Polling error:', error);
      }
    }, 2000); // Poll every 2 seconds
  };

  const toggleCourseVisibility = (courseId: string) => {
    const updatedCourses = courses.map(c =>
      c.id === courseId ? { ...c, visible: !c.visible } : c
    );
    setCourses(updatedCourses);
  };

  const handleContinue = () => {
    onNext({
      brightspaceConnected: true,
      semester,
      courses: courses.filter(c => c.visible),
      assignments: courses.filter(c => c.visible).reduce((sum, c) => sum + c.dueSoon, 0)
    });
  };

  // Waiting state - before data is fetched
  if (fetchStage === 0) {
    return (
      <div className="pg-brightspace" style={{width:"100%",height:"100vh",display:"flex",flexDirection:"column",background:"#1a1214",color:"#f5ecd9",fontFamily:"'Pixelify Sans',monospace",fontSize:"18px",overflow:"hidden"}}>

        <div style={{height:"44px",background:"#0d0709",borderBottom:"4px solid #990000",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",flex:"none"}}>
          <span className="h" style={{fontSize:"11px"}}>WOLFIE SENSEI</span>
          <span className="h" style={{fontSize:"10px",color:"#c9b8a6"}}>SETUP · 3 OF 7</span>
          <div style={{display:"flex",gap:"8px"}} aria-hidden="true">
            <span style={{width:"14px",height:"14px",background:"#f2b632"}}></span>
            <span style={{width:"14px",height:"14px",background:"#6fd27a"}}></span>
            <span style={{width:"14px",height:"14px",background:"#e5484d"}}></span>
          </div>
        </div>

        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:"48px 32px",maxWidth:"800px",width:"100%",boxSizing:"border-box",margin:"0 auto"}}>
          <div className="card" style={{padding:"36px",display:"flex",flexDirection:"column",gap:"28px",alignItems:"center",textAlign:"center"}}>
            <Sprite size={144} variant="idle" />
            <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
              <h1 className="h" style={{margin:0,fontSize:"18px",color:"#f2b632"}}>CONNECT TO BRIGHTSPACE</h1>
              <p style={{margin:0,color:"#e0d2c2",lineHeight:1.4,maxWidth:"500px"}}>I need to read your courses and assignments from Brightspace to build your personalized quest board. Click below to open Brightspace in your browser.</p>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"20px",width:"100%"}}>
              <button type="button" className={isPolling ? "btn off" : "btn gold"} style={{fontSize:"13px",padding:"18px 24px",width:"100%"}} onClick={handleOpenBrightspace} disabled={isPolling}>
                {isPolling ? "WAITING FOR DATA..." : "OPEN BRIGHTSPACE"}
              </button>
              {isPolling && (
                <div style={{display:"flex",alignItems:"center",gap:"10px",justifyContent:"center"}}>
                  <span className="blink" style={{width:"12px",height:"12px",background:"#f2a03a"}}></span>
                  <span style={{color:"#f2a03a",fontSize:"14px"}}>Listening for Brightspace data from Chrome extension...</span>
                </div>
              )}
              {!isPolling && (
                <p style={{margin:0,color:"#c9b8a6",fontSize:"15px"}}>Sign in if needed, then wait on your homepage while I fetch your data.</p>
              )}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",width:"100%",marginTop:"20px"}}>
              <button type="button" className="btn ghost" onClick={onBack}>BACK</button>
              <button type="button" className="btn ghost" onClick={() => onNext({ brightspaceConnected: false, semester: '', courses: [], assignments: 0 })}>SKIP FOR NOW</button>
            </div>
          </div>
        </div>

        <div style={{background:"#0d0709",padding:"20px 32px 28px",overflowX:"auto",flex:"none"}}>
          <div style={{display:"flex",alignItems:"flex-start",minWidth:"860px",maxWidth:"1100px",margin:"0 auto"}}>
            <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
              <div style={{width:"24px",height:"24px",background:"#f2b632",boxShadow:"0 0 0 4px #5a3a41"}}></div>
              <span style={{fontSize:"14px",color:"#f2b632"}}>Hello</span>
            </div>
            <div style={{flex:1,height:"4px",marginTop:"10px",background:"repeating-linear-gradient(90deg,#f2b632 0 8px,transparent 8px 16px)"}}></div>
            <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
              <div style={{width:"24px",height:"24px",background:"#f2b632",boxShadow:"0 0 0 4px #5a3a41"}}></div>
              <span style={{fontSize:"14px",color:"#f2b632"}}>Extension</span>
            </div>
            <div style={{flex:1,height:"4px",marginTop:"10px",background:"repeating-linear-gradient(90deg,#f2b632 0 8px,transparent 8px 16px)"}}></div>
            <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
              <div style={{width:"24px",height:"24px",background:"#c41e1e",boxShadow:"0 0 0 4px #f5ecd9"}}></div>
              <span style={{fontSize:"14px",color:"#f5ecd9",fontWeight:600}}>Brightspace</span>
            </div>
            <div style={{flex:1,height:"4px",marginTop:"10px",background:"repeating-linear-gradient(90deg,#5a3a41 0 8px,transparent 8px 16px)"}}></div>
            <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
              <div style={{width:"24px",height:"24px",background:"#3a2328",boxShadow:"0 0 0 4px #5a3a41"}}></div>
              <span style={{fontSize:"14px",color:"#b9a898"}}>Powers</span>
            </div>
            <div style={{flex:1,height:"4px",marginTop:"10px",background:"repeating-linear-gradient(90deg,#5a3a41 0 8px,transparent 8px 16px)"}}></div>
            <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
              <div style={{width:"24px",height:"24px",background:"#3a2328",boxShadow:"0 0 0 4px #5a3a41"}}></div>
              <span style={{fontSize:"14px",color:"#b9a898"}}>Goals</span>
            </div>
            <div style={{flex:1,height:"4px",marginTop:"10px",background:"repeating-linear-gradient(90deg,#5a3a41 0 8px,transparent 8px 16px)"}}></div>
            <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
              <div style={{width:"24px",height:"24px",background:"#3a2328",boxShadow:"0 0 0 4px #5a3a41"}}></div>
              <span style={{fontSize:"14px",color:"#b9a898"}}>Shields</span>
            </div>
            <div style={{flex:1,height:"4px",marginTop:"10px",background:"repeating-linear-gradient(90deg,#5a3a41 0 8px,transparent 8px 16px)"}}></div>
            <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
              <div style={{width:"24px",height:"24px",background:"#3a2328",boxShadow:"0 0 0 4px #5a3a41"}}></div>
              <span style={{fontSize:"14px",color:"#b9a898"}}>Train!</span>
            </div>
          </div>
        </div>

      </div>
    );
  }

  // Loading/Loaded state - showing fetched data
  return (
    <div className="pg-brightspace" style={{width:"100%",height:"100vh",display:"flex",flexDirection:"column",background:"#1a1214",color:"#f5ecd9",fontFamily:"'Pixelify Sans',monospace",fontSize:"18px",overflow:"hidden"}}>

      <div style={{height:"44px",background:"#0d0709",borderBottom:"4px solid #990000",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",flex:"none"}}>
        <span className="h" style={{fontSize:"11px"}}>WOLFIE SENSEI</span>
        <span className="h" style={{fontSize:"10px",color:"#c9b8a6"}}>SETUP · 3 OF 7</span>
        <div style={{display:"flex",gap:"8px"}} aria-hidden="true">
          <span style={{width:"14px",height:"14px",background:"#f2b632"}}></span>
          <span style={{width:"14px",height:"14px",background:"#6fd27a"}}></span>
          <span style={{width:"14px",height:"14px",background:"#e5484d"}}></span>
        </div>
      </div>

      <div style={{flex:1,display:"flex",flexWrap:"wrap",gap:"44px",alignItems:"stretch",justifyContent:"center",padding:"48px 32px",maxWidth:"1200px",width:"100%",boxSizing:"border-box",margin:"0 auto",overflowY:"auto"}}>

        <div className="card" style={{flex:"1 1 400px",maxWidth:"520px",padding:"32px",display:"flex",flexDirection:"column",gap:"22px"}}>
          <h1 className="h" style={{margin:0,fontSize:"16px",color:"#f2b632"}}>WOLFIE IS FETCHING SCROLLS</h1>
          <div style={{display:"flex",alignItems:"center",gap:"20px"}}>
            <Sprite size={112} variant="idle" />
            <p style={{margin:0,color:"#e0d2c2",lineHeight:1.35}}>Signed in through the extension. I'm reading your courses and due dates now.</p>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"14px"}}>
              <span style={{width:"20px",height:"20px",background: fetchStage >= 1 ? "#6fd27a" : "#5a3a41",flex:"none"}} aria-hidden="true"></span>
              <span style={{flex:1}}>Signed in to Brightspace</span>
              <span style={{color: fetchStage >= 1 ? "#6fd27a" : "#c9b8a6",fontWeight:600}}>{fetchStage >= 1 ? "DONE" : "..."}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"14px"}}>
              <span style={{width:"20px",height:"20px",background: fetchStage >= 2 ? "#6fd27a" : "#5a3a41",flex:"none"}} aria-hidden="true"></span>
              <span style={{flex:1}}>Active semester</span>
              <span style={{color: fetchStage >= 2 ? "#6fd27a" : "#c9b8a6",fontWeight:600}}>{fetchStage >= 2 ? semester : "..."}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"14px"}}>
              <span style={{width:"20px",height:"20px",background: fetchStage >= 3 ? "#6fd27a" : "#5a3a41",flex:"none"}} aria-hidden="true"></span>
              <span style={{flex:1}}>Courses</span>
              <span style={{color: fetchStage >= 3 ? "#6fd27a" : "#c9b8a6",fontWeight:600}}>{fetchStage >= 3 ? `${courses.length} found` : "..."}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
              <div style={{display:"flex",alignItems:"center",gap:"14px"}}>
                {fetchStage >= 4 && fetchStage < 5 ? (
                  <span className="blink" style={{width:"20px",height:"20px",background:"#f2a03a",flex:"none"}} aria-hidden="true"></span>
                ) : fetchStage === 5 ? (
                  <span style={{width:"20px",height:"20px",background:"#6fd27a",flex:"none"}} aria-hidden="true"></span>
                ) : (
                  <span style={{width:"20px",height:"20px",background:"#5a3a41",flex:"none"}} aria-hidden="true"></span>
                )}
                <span style={{flex:1}}>Assignments and due dates</span>
                <span style={{color: fetchStage >= 4 ? (fetchStage === 5 ? "#6fd27a" : "#f2a03a") : "#c9b8a6",fontWeight:600}}>
                  {fetchStage >= 4 ? `${assignmentsProgress} / ${totalAssignments}` : "..."}
                </span>
              </div>
              {fetchStage >= 4 && (
                <div style={{display:"flex",gap:"4px",paddingLeft:"34px"}} role="img" aria-label={`Progress ${assignmentsProgress} of ${totalAssignments}`}>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <span key={i} style={{flex:1,height:"14px",background: i < (assignmentsProgress / totalAssignments * 10) ? "#f2a03a" : "#5a3a41"}}></span>
                  ))}
                </div>
              )}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"14px"}}>
              <span style={{width:"20px",height:"20px",background:"#5a3a41",flex:"none"}} aria-hidden="true"></span>
              <span style={{flex:1,color:"#c9b8a6"}}>Announcements</span>
              <span style={{color:"#c9b8a6"}}>QUEUED</span>
            </div>
          </div>
        </div>

        <div className="card" style={{flex:"1 1 440px",maxWidth:"600px",padding:"32px",display:"flex",flexDirection:"column",gap:"20px",maxHeight:"calc(100vh - 200px)"}}>
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            <h2 className="h" style={{margin:0,fontSize:"16px",color:"#f2b632"}}>CONFIRM WHAT I FOUND</h2>
            <p style={{margin:0,color:"#e0d2c2",lineHeight:1.35}}>Parsing isn't perfect. Fix anything that looks off before I build your to-do list.</p>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
            <label htmlFor="sem" style={{color:"#c9b8a6",fontSize:"16px"}}>Active semester</label>
            <div id="sem" className="card2" style={{padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:600}}>{semester}</span>
              <span style={{color:"#f2b632",fontSize:"14px"}}>detected · change</span>
            </div>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:"10px",overflowY:"auto",flex:1}}>
            <span style={{color:"#c9b8a6",fontSize:"16px"}}>Courses to track ({courses.filter(c => c.visible).length} selected)</span>
            {courses.map(course => (
              <div
                key={course.id}
                className="card2"
                style={{
                  padding:"12px 16px",
                  display:"flex",
                  alignItems:"center",
                  gap:"14px",
                  cursor:"pointer",
                  opacity: course.visible ? 1 : 0.6
                }}
                onClick={() => toggleCourseVisibility(course.id)}
              >
                <span
                  style={{
                    width:"22px",
                    height:"22px",
                    background: course.visible ? "#f2b632" : "#1a1214",
                    boxShadow: course.visible ? "none" : "0 0 0 3px #8a7a70",
                    flex:"none"
                  }}
                  aria-hidden="true"
                ></span>
                <span
                  className="h"
                  style={{
                    fontSize:"11px",
                    width:"96px",
                    flex:"none",
                    color: course.visible ? "#f5ecd9" : "#b9a898"
                  }}
                >
                  {course.code}
                </span>
                <span style={{flex:1,color: course.visible ? "#f5ecd9" : "#b9a898"}}>
                  {course.name}
                </span>
                <span style={{color: course.visible ? "#c9b8a6" : "#b9a898",fontSize:"15px"}}>
                  {course.visible ? `${course.dueSoon} due soon` : "hidden"}
                </span>
              </div>
            ))}
          </div>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"16px",flexWrap:"wrap",marginTop:"auto",paddingTop:"8px"}}>
            <button type="button" className="btn ghost" onClick={onBack}>BACK</button>
            <button type="button" className="btn" onClick={handleContinue}>LOOKS RIGHT</button>
          </div>
        </div>

      </div>

      <div style={{background:"#0d0709",padding:"20px 32px 28px",overflowX:"auto",flex:"none"}}>
        <div style={{display:"flex",alignItems:"flex-start",minWidth:"860px",maxWidth:"1100px",margin:"0 auto"}}>
          <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
            <div style={{width:"24px",height:"24px",background:"#f2b632",boxShadow:"0 0 0 4px #5a3a41"}}></div>
            <span style={{fontSize:"14px",color:"#f2b632"}}>Hello</span>
          </div>
          <div style={{flex:1,height:"4px",marginTop:"10px",background:"repeating-linear-gradient(90deg,#f2b632 0 8px,transparent 8px 16px)"}}></div>
          <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
            <div style={{width:"24px",height:"24px",background:"#f2b632",boxShadow:"0 0 0 4px #5a3a41"}}></div>
            <span style={{fontSize:"14px",color:"#f2b632"}}>Extension</span>
          </div>
          <div style={{flex:1,height:"4px",marginTop:"10px",background:"repeating-linear-gradient(90deg,#f2b632 0 8px,transparent 8px 16px)"}}></div>
          <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
            <div style={{width:"24px",height:"24px",background:"#c41e1e",boxShadow:"0 0 0 4px #f5ecd9"}}></div>
            <span style={{fontSize:"14px",color:"#f5ecd9",fontWeight:600}}>Brightspace</span>
          </div>
          <div style={{flex:1,height:"4px",marginTop:"10px",background:"repeating-linear-gradient(90deg,#5a3a41 0 8px,transparent 8px 16px)"}}></div>
          <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
            <div style={{width:"24px",height:"24px",background:"#3a2328",boxShadow:"0 0 0 4px #5a3a41"}}></div>
            <span style={{fontSize:"14px",color:"#b9a898"}}>Powers</span>
          </div>
          <div style={{flex:1,height:"4px",marginTop:"10px",background:"repeating-linear-gradient(90deg,#5a3a41 0 8px,transparent 8px 16px)"}}></div>
          <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
            <div style={{width:"24px",height:"24px",background:"#3a2328",boxShadow:"0 0 0 4px #5a3a41"}}></div>
            <span style={{fontSize:"14px",color:"#b9a898"}}>Goals</span>
          </div>
          <div style={{flex:1,height:"4px",marginTop:"10px",background:"repeating-linear-gradient(90deg,#5a3a41 0 8px,transparent 8px 16px)"}}></div>
          <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
            <div style={{width:"24px",height:"24px",background:"#3a2328",boxShadow:"0 0 0 4px #5a3a41"}}></div>
            <span style={{fontSize:"14px",color:"#b9a898"}}>Shields</span>
          </div>
          <div style={{flex:1,height:"4px",marginTop:"10px",background:"repeating-linear-gradient(90deg,#5a3a41 0 8px,transparent 8px 16px)"}}></div>
          <div style={{width:"88px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px"}}>
            <div style={{width:"24px",height:"24px",background:"#3a2328",boxShadow:"0 0 0 4px #5a3a41"}}></div>
            <span style={{fontSize:"14px",color:"#b9a898"}}>Train!</span>
          </div>
        </div>
      </div>

    </div>
  );
}
