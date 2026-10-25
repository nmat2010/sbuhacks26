import { useState, useEffect } from 'react';
import Sprite from '../../../../../design/Sprite';

interface BrightspaceProps {
  onNext: () => void;
  onBack: () => void;
  data: any;
  updateData: (updates: any) => void;
}

interface Course {
  id: string;
  code: string;
  name: string;
  dueSoon: number;
  visible: boolean;
}

const DEMO_COURSES: Course[] = [
  { id: '1', code: 'CSE 220', name: 'Systems Fundamentals', dueSoon: 2, visible: true },
  { id: '2', code: 'ESE 271', name: 'Electrical Circuit Analysis', dueSoon: 1, visible: true },
  { id: '3', code: 'AMS 261', name: 'Applied Calculus III', dueSoon: 1, visible: true },
  { id: '4', code: 'PHY 131', name: 'Classical Physics I', dueSoon: 0, visible: true },
  { id: '5', code: 'WRT 102', name: 'Intermediate Writing Workshop', dueSoon: 0, visible: false },
];

export default function Brightspace({ onNext, onBack, data: _data, updateData }: BrightspaceProps) {
  const [fetchStage, setFetchStage] = useState(0); // 0: signin, 1: semester, 2: courses, 3: assignments, 4: announcements
  const [assignmentsProgress, setAssignmentsProgress] = useState(0);
  const [totalAssignments] = useState(23);
  const [courses, setCourses] = useState<Course[]>([]);
  const [semester] = useState('Fall 2026');

  // Simulate fetching process
  useEffect(() => {
    const stages = [
      { delay: 500, stage: 1 }, // Signed in
      { delay: 1000, stage: 2 }, // Found semester
      { delay: 1500, stage: 3 }, // Found courses
      { delay: 2000, stage: 4 }, // Start fetching assignments
    ];

    stages.forEach(({ delay, stage }) => {
      setTimeout(() => setFetchStage(stage), delay);
    });

    // Set courses after courses stage
    setTimeout(() => {
      setCourses(DEMO_COURSES);
      updateData({
        courses: DEMO_COURSES.filter(c => c.visible),
        semester: 'Fall 2026',
        brightspaceConnected: true
      });
    }, 1500);

    // Animate assignment progress
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += 1;
      if (progress <= 18) {
        setAssignmentsProgress(progress);
      } else {
        clearInterval(progressInterval);
        setTimeout(() => setFetchStage(5), 500); // Move to announcements queued
      }
    }, 150);

    return () => clearInterval(progressInterval);
  }, []);

  const toggleCourseVisibility = (courseId: string) => {
    const updatedCourses = courses.map(c =>
      c.id === courseId ? { ...c, visible: !c.visible } : c
    );
    setCourses(updatedCourses);
    updateData({ courses: updatedCourses.filter(c => c.visible) });
  };

  return (
    <div className="pg-brightspace" style={{width:"100%",minHeight:"880px",display:"flex",flexDirection:"column",background:"#1a1214",color:"#f5ecd9",fontFamily:"'Pixelify Sans',monospace",fontSize:"18px"}}>

      <div style={{height:"44px",background:"#0d0709",borderBottom:"4px solid #990000",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",flex:"none"}}>
        <span className="h" style={{fontSize:"11px"}}>WOLFIE SENSEI</span>
        <span className="h" style={{fontSize:"10px",color:"#c9b8a6"}}>SETUP · 3 OF 7</span>
        <div style={{display:"flex",gap:"8px"}} aria-hidden="true">
          <span style={{width:"14px",height:"14px",background:"#f2b632"}}></span>
          <span style={{width:"14px",height:"14px",background:"#6fd27a"}}></span>
          <span style={{width:"14px",height:"14px",background:"#e5484d"}}></span>
        </div>
      </div>

      <div style={{flex:1,display:"flex",flexWrap:"wrap",gap:"44px",alignItems:"stretch",justifyContent:"center",padding:"48px 32px",maxWidth:"1200px",width:"100%",boxSizing:"border-box",margin:"0 auto"}}>

        <div className="card" style={{flex:"1 1 400px",maxWidth:"520px",padding:"32px",display:"flex",flexDirection:"column",gap:"22px"}}>
          <h1 className="h" style={{margin:0,fontSize:"16px",color:"#f2b632"}}>WOLFIE IS FETCHING SCROLLS</h1>
          <div style={{display:"flex",alignItems:"center",gap:"20px"}}>
            <div style={{flex:"none"}}>
              <Sprite size={112} variant="idle" />
            </div>
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
                {fetchStage >= 4 && assignmentsProgress < 18 ? (
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

        <div className="card" style={{flex:"1 1 440px",maxWidth:"600px",padding:"32px",display:"flex",flexDirection:"column",gap:"20px"}}>
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            <h2 className="h" style={{margin:0,fontSize:"16px",color:"#f2b632"}}>CONFIRM WHAT I FOUND</h2>
            <p style={{margin:0,color:"#e0d2c2",lineHeight:1.35}}>Parsing isn't perfect. Fix anything that looks off before I build your to-do list.</p>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
            <label htmlFor="sem" style={{color:"#c9b8a6",fontSize:"16px"}}>Active semester</label>
            <div id="sem" className="card2" style={{padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:600}}>Fall 2026</span>
              <span style={{color:"#f2b632",fontSize:"14px"}}>detected · change</span>
            </div>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            <span style={{color:"#c9b8a6",fontSize:"16px"}}>Courses to track</span>
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
            <button type="button" className="btn" onClick={onNext}>LOOKS RIGHT</button>
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
