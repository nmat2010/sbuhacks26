import type { BrightspaceData, BrightspaceCourse, BrightspaceAssignment, BrightspaceResource } from '@wolfie/shared';

// Brightspace course and assignment scraper for the browser extension.
// Detects Brightspace pages and extracts course/assignment data to send to the desktop.

/** Detects if we're on a Brightspace page */
export function isBrightspace(hostname: string, pathname: string): boolean {
  // Match common Brightspace patterns:
  // - *.brightspace.com
  // - brightspace.*.edu
  // - *.desire2learn.com (old D2L branding)
  // - mycourses.*.edu/d2l/ (common for universities like Stony Brook)
  const isBrightspaceDomain = (
    hostname.includes('brightspace') ||
    hostname.includes('desire2learn') ||
    hostname.includes('mycourses') ||
    (hostname.includes('.edu') && pathname.includes('/d2l/'))
  );

  console.log('[Wolfie Brightspace] Detection check:', { hostname, pathname, isBrightspaceDomain });
  return isBrightspaceDomain;
}

/** Detects if we're on the Brightspace homepage/course list */
export function isBrightspaceHomepage(pathname: string): boolean {
  return (
    pathname.includes('/d2l/home') && !pathname.match(/\/d2l\/home\/\d+/) || // /d2l/home but not /d2l/home/12345
    pathname.includes('/d2l/lp/homepage') ||
    pathname === '/d2l/' ||
    (pathname.startsWith('/d2l/home') && !pathname.match(/\/d2l\/home\/\d+/))
  );
}

/** Detects if we're on a course content page */
export function isBrightspaceCoursePage(pathname: string): boolean {
  return (
    pathname.match(/\/d2l\/home\/\d+/) !== null || // /d2l/home/12345
    pathname.includes('/d2l/le/content/') || // Content pages
    pathname.includes('/d2l/lms/content/') ||
    pathname.includes('/d2l/le/lessons/') // Lessons/modules
  );
}

/** Extracts course ID from course page URL */
export function extractCourseIdFromUrl(pathname: string): string | null {
  // Try to match /d2l/home/{id} or /d2l/le/content/{id}/
  const homeMatch = pathname.match(/\/d2l\/home\/(\d+)/);
  if (homeMatch) return homeMatch[1];

  const contentMatch = pathname.match(/\/d2l\/(?:le|lms)\/(?:content|lessons)\/(\d+)/);
  if (contentMatch) return contentMatch[1];

  return null;
}

/** Extracts semester name from Brightspace */
function extractSemester(doc: Document): string {
  // Try to find semester from org unit selector or page title
  const orgSelector = doc.querySelector('[data-key="orgUnitSelector"]');
  if (orgSelector?.textContent) {
    const match = orgSelector.textContent.match(/(Fall|Spring|Summer|Winter)\s+\d{4}/);
    if (match) return match[0];
  }

  // Fallback: construct from current date
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  if (month >= 7 && month <= 11) return `Fall ${year}`;
  if (month >= 0 && month <= 4) return `Spring ${year}`;
  return `Summer ${year}`;
}

/** Extracts course code from course name (e.g., "CSE 220" from "CSE 220: Systems Fundamentals") */
function extractCourseCode(courseName: string): string {
  const match = courseName.match(/^([A-Z]{2,4}\s*\d{3}[A-Z]?)/);
  return match ? match[1].trim() : courseName.split(':')[0].split('-')[0].trim();
}

/** Helper to search inside shadow DOM */
function querySelectorDeep(root: Document | Element | ShadowRoot, selector: string): Element[] {
  const results: Element[] = [];

  // Search in current root
  const elements = root.querySelectorAll(selector);
  results.push(...Array.from(elements));

  // Search in all shadow roots
  const allElements = root.querySelectorAll('*');
  for (const el of allElements) {
    if (el.shadowRoot) {
      results.push(...querySelectorDeep(el.shadowRoot, selector));
    }
  }

  return results;
}

/** Scrapes courses from Brightspace homepage */
export function scrapeCourses(doc: Document): BrightspaceCourse[] {
  const courses: BrightspaceCourse[] = [];

  // Log what we're looking at
  console.log('[Wolfie Brightspace] Document body classes:', doc.body.className);
  console.log('[Wolfie Brightspace] Looking for course cards...');

  // Check if d2l-my-courses-v2 exists and has shadow DOM
  const myCoursesWidget = doc.querySelector('d2l-my-courses-v2');
  if (myCoursesWidget?.shadowRoot) {
    console.log('[Wolfie Brightspace] Found d2l-my-courses-v2 with shadow DOM, searching inside...');
  } else if (myCoursesWidget) {
    console.log('[Wolfie Brightspace] Found d2l-my-courses-v2 but no shadow DOM (yet?)');
  } else {
    console.log('[Wolfie Brightspace] No d2l-my-courses-v2 widget found');
  }

  // Brightspace uses widgets/cards for courses
  // Try multiple selectors for different Brightspace layouts
  const selectorGroups = [
    // Stony Brook / modern Brightspace
    {
      name: 'Modern Brightspace widget',
      container: 'd2l-my-courses',
      card: 'd2l-card',
      link: 'a[href*="/d2l/home/"]',
      title: 'h3, [role="heading"]'
    },
    // Try generic d2l selectors
    {
      name: 'Generic D2L cards',
      container: null,
      card: '.d2l-my-courses-card, .d2l-widget-course, .d2l-course-tile, [data-course-id]',
      link: 'a[href*="/d2l/"]',
      title: '.d2l-course-name, .d2l-textblock, d2l-heading, h3, h4'
    }
  ];

  // Look for d2l-card elements which contain course information (including shadow DOM)
  const courseCards = querySelectorDeep(doc, 'd2l-card');
  console.log('[Wolfie Brightspace] Found', courseCards.length, 'd2l-card elements (including shadow DOM)');

  if (courseCards.length > 0) {
    for (const card of courseCards) {
      // Debug: log what's in each card
      console.log('[Wolfie Brightspace] Inspecting card:', {
        innerHTML: card.innerHTML.substring(0, 200),
        hasLink: !!card.querySelector('a[href*="/d2l/home/"]'),
        allLinks: Array.from(card.querySelectorAll('a')).map(a => a.href).slice(0, 3)
      });

      // Find the link within the card
      const link = card.querySelector('a[href*="/d2l/home/"]') as HTMLAnchorElement;
      if (!link) {
        console.log('[Wolfie Brightspace] Card has no link to /d2l/home/, trying broader search...');
        // Try any link with /d2l/ in it
        const anyLink = card.querySelector('a[href*="/d2l/"]') as HTMLAnchorElement;
        if (anyLink) {
          console.log('[Wolfie Brightspace] Found alternative link:', anyLink.href);
        }
        continue;
      }

      const href = link.href;

      // Skip "Course Home" navigation links - we want actual course cards
      if (link.textContent?.trim() === 'Course Home') continue;

      const courseId = href.match(/\/(\d+)$/)?.[1] || `course_${courses.length}`;

      // Look for the course title in the card - usually in a heading
      const headingEl = card.querySelector('h3, [role="heading"], d2l-heading');
      const titleText = headingEl?.textContent?.trim() || link.textContent?.trim() || '';

      if (!titleText || titleText.length < 3) continue;

      const courseCode = extractCourseCode(titleText);
      let courseName = titleText;

      // Try to extract name after code
      if (titleText.includes(':')) {
        courseName = titleText.split(':').slice(1).join(':').trim();
      } else if (titleText.includes('-')) {
        // Handle formats like "-COM 106.01 Introduction to Mass..."
        const parts = titleText.split('-');
        if (parts.length > 1) {
          const afterDash = parts.slice(1).join('-').trim();
          const codeMatch = afterDash.match(/^([A-Z]{2,4}\s*\d{3}\.?\d*)/);
          if (codeMatch) {
            const code = codeMatch[1].trim();
            courseName = afterDash.replace(code, '').trim();
            courses.push({
              id: courseId,
              code: code,
              name: courseName,
              url: href,
              assignments: [],
              resources: []
            });
            console.log('[Wolfie Brightspace] Found course:', { titleText, courseCode: code, courseName, courseId, href });
            continue;
          }
        }
      }

      if (courseCode && titleText !== courseCode) {
        courseName = titleText.replace(courseCode, '').trim();
      }

      console.log('[Wolfie Brightspace] Found course:', { titleText, courseCode, courseName, courseId, href });

      courses.push({
        id: courseId,
        code: courseCode,
        name: courseName || titleText,
        url: href,
        assignments: [],
        resources: []
      });
    }
  }

  if (courses.length === 0) {
    console.log('[Wolfie Brightspace] No courses found via links, trying card selectors...');

    // Fallback to card-based detection
    for (const group of selectorGroups) {
      console.log('[Wolfie Brightspace] Trying', group.name);
      const cards = doc.querySelectorAll(group.card);
      console.log('[Wolfie Brightspace] Found', cards.length, 'cards with selector:', group.card);

      if (cards.length === 0) continue;

      for (const card of cards) {
        const linkEl = card.querySelector(group.link) as HTMLAnchorElement;
        const titleEl = card.querySelector(group.title);

        if (!linkEl || !titleEl?.textContent) continue;

        const fullName = titleEl.textContent.trim();
        const courseCode = extractCourseCode(fullName);
        const url = linkEl.href;
        const courseId = url.match(/ou=(\d+)/)?.[1] || url.match(/\/(\d+)$/)?.[1] || `course_${courses.length}`;

        let courseName = fullName;
        if (fullName.includes(':')) {
          courseName = fullName.split(':').slice(1).join(':').trim();
        } else if (courseCode) {
          courseName = fullName.replace(courseCode, '').trim();
        }

        courses.push({
          id: courseId,
          code: courseCode,
          name: courseName || fullName,
          url,
          assignments: [],
          resources: []
        });
      }

      if (courses.length > 0) {
        console.log('[Wolfie Brightspace] Success with', group.name);
        break;
      }
    }
  }

  return courses;
}

/** Scrapes assignments from a course page */
export function scrapeAssignments(doc: Document, courseId: string): BrightspaceAssignment[] {
  const assignments: BrightspaceAssignment[] = [];

  // Selectors for assignment lists
  const selectors = [
    '.d2l-datalist-item',
    '.d2l-assignment-row',
    'tr[data-assignment-id]',
    '.d2l-widget-item',
    '[class*="assignment-item"]'
  ];

  for (const selector of selectors) {
    const elements = doc.querySelectorAll(selector);
    if (elements.length === 0) continue;

    for (const el of elements) {
      // Extract assignment title
      const titleEl = el.querySelector('.d2l-textblock, d2l-heading, h3, h4, .assignment-name, a');
      if (!titleEl?.textContent) continue;

      const title = titleEl.textContent.trim();

      // Extract due date
      const dueDateEl = el.querySelector('.d2l-date, .due-date, [class*="due"]');
      let dueDate: string | undefined;
      if (dueDateEl?.textContent) {
        try {
          const parsed = new Date(dueDateEl.textContent.trim());
          if (!isNaN(parsed.getTime())) {
            dueDate = parsed.toISOString();
          }
        } catch {
          // Invalid date, leave undefined
        }
      }

      // Check if completed
      const isCompleted =
        el.querySelector('.d2l-checkbox input[checked]') !== null ||
        el.classList.contains('completed') ||
        el.classList.contains('d2l-complete');

      // Extract URL
      const linkEl = el.querySelector('a[href]') as HTMLAnchorElement;
      const url = linkEl?.href;

      // Extract assignment ID
      const assignmentId =
        (el as HTMLElement).dataset.assignmentId ||
        url?.match(/\/d2l\/.*\/(\d+)/)?.[1] ||
        `assignment_${assignments.length}`;

      assignments.push({
        id: assignmentId,
        title,
        courseId,
        dueDate,
        isCompleted,
        url
      });
    }

    if (assignments.length > 0) break;
  }

  return assignments;
}

/** Scrapes resources from a course content page */
export function scrapeResources(doc: Document, courseId: string): BrightspaceResource[] {
  const resources: BrightspaceResource[] = [];
  console.log('[Wolfie Brightspace] Scraping resources for course:', courseId);

  // Look for content items in the course content area
  const contentSelectors = [
    '.d2l-le-TreeAccordionLesson', // Modules/lessons
    'd2l-list-item', // List items in content
    '.d2l-fileviewer-pdf-pdfjs', // PDF files
    '.d2l-consistent-evaluation-page-requirements-module-list-item', // Content items
    '[data-activity-id]', // Activity items
    'li[class*="d2l-le"]', // Generic content list items
    '.d2l-datalist-item' // Data list items
  ];

  // Try each selector
  for (const selector of contentSelectors) {
    const items = doc.querySelectorAll(selector);
    if (items.length === 0) continue;

    console.log('[Wolfie Brightspace] Found', items.length, 'items with selector:', selector);

    for (const item of items) {
      // Get the link and title
      const linkEl = item.querySelector('a[href]') as HTMLAnchorElement;
      const titleEl = item.querySelector('.d2l-textblock, d2l-heading, h3, h4, span, a') || linkEl;

      if (!titleEl?.textContent || titleEl.textContent.trim().length < 2) continue;

      const title = titleEl.textContent.trim();
      const url = linkEl?.href;

      // Determine resource type based on URL and context
      let type = 'content';
      if (url) {
        if (url.includes('/dropbox/')) type = 'assignment';
        else if (url.includes('/quiz/')) type = 'quiz';
        else if (url.includes('/discussions/')) type = 'discussion';
        else if (url.includes('/viewContent/') || url.includes('/contentFile/')) type = 'file';
        else if (url.includes('http') && !url.includes(doc.location.hostname)) type = 'link';
        else if (url.includes('/lessons/')) type = 'module';
      }

      // Check for due date
      const dueDateEl = item.querySelector('.d2l-date, [class*="due-date"]');
      let dueDate: string | undefined;
      if (dueDateEl?.textContent) {
        try {
          const parsed = new Date(dueDateEl.textContent.trim());
          if (!isNaN(parsed.getTime())) {
            dueDate = parsed.toISOString();
          }
        } catch {
          // Invalid date
        }
      }

      // Extract resource ID from URL or use title hash
      const id = url?.match(/\/(\d+)/)?.[1] ||
                 `resource_${title.replace(/\s+/g, '_').substring(0, 20)}_${resources.length}`;

      resources.push({
        id,
        title,
        type,
        url,
        dueDate
      });

      console.log('[Wolfie Brightspace] Found resource:', { title, type, url });
    }

    if (resources.length > 0) break;
  }

  console.log('[Wolfie Brightspace] Scraped', resources.length, 'resources from DOM');
  return resources;
}

/** Fetches resources from Brightspace Content API */
async function fetchResourcesFromAPI(courseId: string): Promise<BrightspaceResource[]> {
  const resources: BrightspaceResource[] = [];

  try {
    // Try to fetch table of contents from content API
    const tocUrl = `/d2l/api/le/1.47/${courseId}/content/toc`;
    console.log('[Wolfie Brightspace] Fetching TOC from:', tocUrl);

    const tocData = await fetchFromAPI(tocUrl);

    if (tocData?.Modules && Array.isArray(tocData.Modules)) {
      console.log('[Wolfie Brightspace] Found', tocData.Modules.length, 'modules in TOC');

      for (const module of tocData.Modules) {
        // Add module as a resource
        resources.push({
          id: module.ModuleId?.toString() || `module_${resources.length}`,
          title: module.Title || 'Untitled Module',
          type: 'module',
          url: module.Url
        });

        // Add topics/items within the module
        if (module.Topics && Array.isArray(module.Topics)) {
          for (const topic of module.Topics) {
            let type = 'content';
            const url = topic.Url || '';

            if (url.includes('/dropbox/')) type = 'assignment';
            else if (url.includes('/quiz/')) type = 'quiz';
            else if (url.includes('/discussions/')) type = 'discussion';
            else if (topic.TypeIdentifier === 'File') type = 'file';
            else if (topic.TypeIdentifier === 'Link') type = 'link';

            resources.push({
              id: topic.TopicId?.toString() || `topic_${resources.length}`,
              title: topic.Title || 'Untitled Item',
              type,
              url: topic.Url
            });
          }
        }
      }

      console.log('[Wolfie Brightspace] Fetched', resources.length, 'resources from API');
    }
  } catch (error) {
    console.warn('[Wolfie Brightspace] Failed to fetch resources from API:', error);
  }

  return resources;
}

/** Scrapes tasks/assignments from calendar widget */
function scrapeCalendarTasks(doc: Document): BrightspaceAssignment[] {
  const tasks: BrightspaceAssignment[] = [];
  console.log('[Wolfie Brightspace] Scraping calendar tasks...');

  // Look for calendar events in the data list
  const calendarItems = doc.querySelectorAll('.d2l-datalist-item');
  console.log('[Wolfie Brightspace] Found', calendarItems.length, 'calendar items');

  for (const item of calendarItems) {
    const linkEl = item.querySelector('a[href*="/calendar/"]') as HTMLAnchorElement;
    if (!linkEl) continue;

    const titleText = item.querySelector('.d2l-textblock:not(.d2l_2_14_437)')?.textContent?.trim();
    if (!titleText || titleText.length < 3) continue;

    // Extract course info from subtitle
    const courseSubtitle = item.querySelector('.d2l-textblock.d2l_2_14_437')?.textContent?.trim();
    let courseId = '';
    let courseCode = '';

    if (courseSubtitle) {
      // Format: "-ANT 102.01 What Makes Us Human? - Fall 2026"
      const courseMatch = courseSubtitle.match(/([A-Z]{2,4}\s*\d{3}\.?\d*)/);
      if (courseMatch) {
        courseCode = courseMatch[1];
        courseId = courseCode.replace(/\s+/g, '_');
      }
    }

    // Extract due date
    const dateEl = item.querySelector('.d2l-textblock-strong');
    let dueDate: string | undefined;
    if (dateEl?.textContent) {
      try {
        // Format: "11:59 PM"
        const timeStr = dateEl.textContent.trim();
        const dateStr = item.querySelector('.d2l-textblock.d2l_2_13_745.d2l_2_16_973')?.textContent?.trim();
        const monthStr = item.querySelector('.d2l-textblock.d2l_2_13_745.d2l_2_14_437')?.textContent?.trim();

        if (dateStr && monthStr) {
          // Construct full date string
          const fullDateStr = `${monthStr} ${dateStr}, ${new Date().getFullYear()} ${timeStr}`;
          const parsed = new Date(fullDateStr);
          if (!isNaN(parsed.getTime())) {
            dueDate = parsed.toISOString();
          }
        }
      } catch (e) {
        console.warn('[Wolfie Brightspace] Failed to parse date:', e);
      }
    }

    tasks.push({
      id: linkEl.href.match(/\/(\d+)/)?.[1] || `task_${tasks.length}`,
      title: titleText,
      courseId: courseId || 'unknown',
      dueDate,
      isCompleted: false,
      url: linkEl.href
    });

    console.log('[Wolfie Brightspace] Found task:', { title: titleText, courseCode, dueDate });
  }

  return tasks;
}

/** Attempts to fetch data from Brightspace API endpoints */
async function fetchFromAPI(endpoint: string): Promise<any> {
  try {
    console.log('[Wolfie Brightspace] Fetching from API:', endpoint);
    const response = await fetch(endpoint, {
      credentials: 'same-origin',
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      console.warn('[Wolfie Brightspace] API request failed:', response.status);
      return null;
    }

    const data = await response.json();
    console.log('[Wolfie Brightspace] API response:', data);
    return data;
  } catch (error) {
    console.error('[Wolfie Brightspace] API fetch error:', error);
    return null;
  }
}

/** Waits for web component to be defined and rendered */
async function waitForComponent(doc: Document, selector: string, timeout = 5000): Promise<Element | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const element = doc.querySelector(selector);
    if (element) {
      console.log('[Wolfie Brightspace] Found component:', selector);
      return element;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.warn('[Wolfie Brightspace] Component not found after timeout:', selector);
  return null;
}

/** Scrapes data from a single course page */
export async function scrapeCoursePage(doc: Document, pathname: string): Promise<{ courseId: string; resources: BrightspaceResource[] } | null> {
  const courseId = extractCourseIdFromUrl(pathname);
  if (!courseId) {
    console.warn('[Wolfie Brightspace] Could not extract course ID from URL:', pathname);
    return null;
  }

  console.log('[Wolfie Brightspace] Scraping course page for course ID:', courseId);

  // Try to scrape resources from DOM first
  let resources = scrapeResources(doc, courseId);

  // If no resources found via DOM, try API
  if (resources.length === 0) {
    console.log('[Wolfie Brightspace] No resources from DOM, trying API...');
    resources = await fetchResourcesFromAPI(courseId);
  }

  console.log('[Wolfie Brightspace] Total resources found:', resources.length);

  return {
    courseId,
    resources
  };
}

/** Main function to scrape all Brightspace data */
export async function scrapeBrightspace(doc: Document, pathname: string): Promise<BrightspaceData | null> {
  console.log('[Wolfie Brightspace] Attempting to scrape from pathname:', pathname);

  // Only scrape from homepage or course overview pages
  if (!isBrightspaceHomepage(pathname)) {
    console.log('[Wolfie Brightspace] Not a homepage, skipping scrape');
    return null;
  }

  console.log('[Wolfie Brightspace] This is a homepage, extracting data...');

  // Wait for the my-courses web component to load
  console.log('[Wolfie Brightspace] Waiting for d2l-my-courses-v2 component...');
  const myCoursesWidget = await waitForComponent(doc, 'd2l-my-courses-v2');

  if (myCoursesWidget) {
    console.log('[Wolfie Brightspace] Found d2l-my-courses-v2 component');
    console.log('[Wolfie Brightspace] Component attributes:', {
      enrollmentsUrl: myCoursesWidget.getAttribute('enrollments-url'),
      semestersUrl: myCoursesWidget.getAttribute('semesters-url'),
      hasShadowRoot: !!myCoursesWidget.shadowRoot
    });
  } else {
    console.warn('[Wolfie Brightspace] d2l-my-courses-v2 component not found after waiting');
  }

  let semester = extractSemester(doc);
  let courses = scrapeCourses(doc);

  console.log('[Wolfie Brightspace] DOM scraping results:', {
    courseCount: courses.length,
    semester,
    hasWidget: !!myCoursesWidget
  });

  // If no courses found via DOM scraping, try API endpoints
  if (courses.length === 0 && myCoursesWidget) {
    console.log('[Wolfie Brightspace] No courses via DOM, trying API endpoints...');

    const enrollmentsUrl = myCoursesWidget.getAttribute('enrollments-url');
    const semestersUrl = myCoursesWidget.getAttribute('semesters-url');

    console.log('[Wolfie Brightspace] API URLs:', { enrollmentsUrl, semestersUrl });

    // Fetch semesters FIRST to get the current semester name for filtering
    if (semestersUrl) {
      const semestersData = await fetchFromAPI(semestersUrl);
      console.log('[Wolfie Brightspace] Semesters data:', semestersData);

      if (Array.isArray(semestersData)) {
        // The API returns an array of semesters
        console.log('[Wolfie Brightspace] Found', semestersData.length, 'semesters');

        // Find the current/active semester
        // Look for semesters with current date between start and end
        const now = new Date();

        console.log('[Wolfie Brightspace] Current date:', now.toISOString());
        console.log('[Wolfie Brightspace] All semesters with FULL details:');
        semestersData.forEach((s: any, index: number) => {
          console.log(`  [${index}] Name: "${s.Name}", Code: "${s.Code}"`, {
            StartDate: s.StartDate,
            EndDate: s.EndDate,
            IsCurrent: s.IsCurrent,
            IsActive: s.IsActive,
            OrgUnitId: s.OrgUnitId,
            raw: s
          });
        });

        // Try multiple strategies to find current semester:

        // Strategy 1: Look for IsCurrent flag
        let currentSemester = semestersData.find((s: any) => s.IsCurrent === true);

        // Strategy 2: Look for IsActive flag
        if (!currentSemester) {
          currentSemester = semestersData.find((s: any) => s.IsActive === true);
        }

        // Strategy 3: Look for date range containing today
        if (!currentSemester) {
          currentSemester = semestersData.find((s: any) => {
            if (!s.StartDate || !s.EndDate) return false;
            const start = new Date(s.StartDate);
            const end = new Date(s.EndDate);
            console.log('[Wolfie Brightspace] Checking semester:', s.Name, 'start:', start, 'end:', end, 'matches:', now >= start && now <= end);
            return now >= start && now <= end;
          });
        }

        // Strategy 4: Match semester name pattern based on current date
        if (!currentSemester) {
          const year = now.getFullYear();
          const month = now.getMonth(); // 0-11

          // Determine expected semester name based on date
          let expectedSemesters: string[] = [];

          if (month >= 8 && month <= 11) {
            // Aug-Dec = Fall semester
            expectedSemesters = [
              `Fall ${year}`,
              `${year}-${year + 1}`, // Academic year format
              `Fall${year}`,
              `F${year}`
            ];
            console.log('[Wolfie Brightspace] Looking for Fall semester:', expectedSemesters);
          } else if (month >= 0 && month <= 4) {
            // Jan-May = Spring semester
            expectedSemesters = [
              `Spring ${year}`,
              `${year - 1}-${year}`, // Academic year format
              `Spring${year}`,
              `S${year}`
            ];
            console.log('[Wolfie Brightspace] Looking for Spring semester:', expectedSemesters);
          } else {
            // May-Aug = Summer semester
            expectedSemesters = [
              `Summer ${year}`,
              `${year}-${year + 1}`,
              `Summer${year}`,
              `Su${year}`
            ];
            console.log('[Wolfie Brightspace] Looking for Summer semester:', expectedSemesters);
          }

          // Try to find a semester that matches expected names
          for (const expectedName of expectedSemesters) {
            currentSemester = semestersData.find((s: any) =>
              s.Name?.toLowerCase().includes(expectedName.toLowerCase())
            );
            if (currentSemester) {
              console.log('[Wolfie Brightspace] Found semester by name pattern:', currentSemester.Name, 'matches', expectedName);
              break;
            }
          }
        }

        // Strategy 5: Find the MOST RECENT semester by EndDate (last resort)
        if (!currentSemester && semestersData.length > 0) {
          // Sort by EndDate descending to get most recent
          const sorted = [...semestersData].sort((a: any, b: any) => {
            if (!a.EndDate || !b.EndDate) return 0;
            return new Date(b.EndDate).getTime() - new Date(a.EndDate).getTime();
          });
          currentSemester = sorted[0];
          console.log('[Wolfie Brightspace] Using most recent semester by EndDate as last resort:', currentSemester?.Name);
        }

        if (currentSemester?.Name) {
          semester = currentSemester.Name;
          const currentSemesterOrgUnitId = currentSemester.OrgUnitId;
          console.log('[Wolfie Brightspace] Selected current semester:', semester, 'OrgUnitId:', currentSemesterOrgUnitId, currentSemester);

          // Store in a variable we can access later for filtering
          (window as any).__wolfie_current_semester_org_unit_id = currentSemesterOrgUnitId;
        }
      } else if (semestersData?.Items && semestersData.Items.length > 0) {
        // Alternative format
        const activeSemester = semestersData.Items.find((s: any) => s.IsActive) || semestersData.Items[0];
        if (activeSemester?.Name) {
          semester = activeSemester.Name;
          console.log('[Wolfie Brightspace] Fetched semester from API:', semester);
        }
      }
    }

    // Helper function to check if a course belongs to current semester by checking org unit ancestry
    const checkCourseInCurrentSemester = async (courseOrgUnitId: string): Promise<boolean> => {
      const currentSemesterOrgUnitId = (window as any).__wolfie_current_semester_org_unit_id;
      if (!currentSemesterOrgUnitId) return false;

      try {
        // Fetch org unit parents/ancestors
        const parentsUrl = `/d2l/api/lp/1.43/orgstructure/${courseOrgUnitId}/parents/`;
        const parentsData = await fetchFromAPI(parentsUrl);

        if (Array.isArray(parentsData)) {
          // Check if current semester's org unit ID is in the parents
          const isInCurrentSemester = parentsData.some((parent: any) =>
            parent.Identifier === currentSemesterOrgUnitId || parent.OrgUnitId === currentSemesterOrgUnitId
          );
          console.log('[Wolfie Brightspace] Course', courseOrgUnitId, 'belongs to current semester:', isInCurrentSemester);
          return isInCurrentSemester;
        }
      } catch (error) {
        console.warn('[Wolfie Brightspace] Failed to fetch parents for course', courseOrgUnitId, error);
      }

      return false;
    };

    if (enrollmentsUrl) {
      const enrollmentsData = await fetchFromAPI(enrollmentsUrl);

      // Debug: log the actual structure
      console.log('[Wolfie Brightspace] API response structure:', {
        hasItems: !!enrollmentsData?.Items,
        hasCourses: !!enrollmentsData?.Courses,
        keys: enrollmentsData ? Object.keys(enrollmentsData) : [],
        type: typeof enrollmentsData,
        sampleItem: enrollmentsData?.Items?.[0] || enrollmentsData?.Courses?.[0] || enrollmentsData?.[0]
      });

      // Brightspace API returns { Courses: [...] }
      if (enrollmentsData?.Courses && Array.isArray(enrollmentsData.Courses)) {
        console.log('[Wolfie Brightspace] Found Courses array with', enrollmentsData.Courses.length, 'items');

        const allCourses = enrollmentsData.Courses
          .filter((item: any) => item.IsActive) // Only active courses
          .map((item: any, index: number) => {
            const courseName = item.Name || '';
            const courseCode = item.Code || extractCourseCode(courseName);

            // Clean up the course name (remove leading dash and code)
            let cleanName = courseName;
            if (cleanName.startsWith('-')) {
              cleanName = cleanName.substring(1).trim();
            }
            if (courseCode && cleanName.startsWith(courseCode)) {
              cleanName = cleanName.substring(courseCode.length).trim();
            }

            if (!item.SemesterName) {
              console.warn('[Wolfie Brightspace] Course missing SemesterName:', {
                code: courseCode,
                name: courseName,
                orgUnitId: item.OrgUnitId,
                allKeys: Object.keys(item)
              });
            }

            console.log('[Wolfie Brightspace] Course filter check:', {
              code: courseCode,
              name: courseName,
              semesterName: item.SemesterName,
              currentSemester: semester,
              isActive: item.IsActive,
              orgUnitId: item.OrgUnitId,
              willBeFiltered: item.SemesterName !== semester && item.SemesterName !== undefined
            });

            return {
              id: item.OrgUnitId?.toString() || `course_${index}`,
              code: courseCode,
              name: cleanName,
              url: `/d2l/home/${item.OrgUnitId}`,
              semester: item.SemesterName || undefined,
              orgUnitId: item.OrgUnitId,
              assignments: [],
              resources: []
            };
          });

        console.log('[Wolfie Brightspace] Courses before semester enrichment:', allCourses.length);

        // Check if we need to enrich semester info using org unit parents
        const coursesWithoutSemester = allCourses.filter((c: { semester?: string }) => !c.semester);
        console.log('[Wolfie Brightspace] Courses missing semester:', coursesWithoutSemester.length);

        if (coursesWithoutSemester.length > 0) {
          console.log('[Wolfie Brightspace] Enriching semester info using org unit ancestry...');

          // Fetch org unit parents for courses without semester info
          for (const course of coursesWithoutSemester) {
            if (course.orgUnitId) {
              const belongsToCurrentSemester = await checkCourseInCurrentSemester(course.orgUnitId);
              if (belongsToCurrentSemester) {
                course.semester = semester; // Assign current semester
                console.log('[Wolfie Brightspace] Enriched course', course.code, 'with semester:', semester);
              } else {
                console.log('[Wolfie Brightspace] Course', course.code, 'does NOT belong to current semester, excluding');
              }
            }
          }
        }

        // Filter to only courses from the current semester
        // STRICT filtering: only include courses that match the current semester
        // If semester info is missing, we'll try to fetch it
        courses = allCourses.filter((course: { code: string; semester?: string }) => {
          const include = course.semester === semester;
          if (!include) {
            console.log('[Wolfie Brightspace] Excluding course:', course.code, 'from semester:', course.semester, '(current:', semester + ')');
          }
          return include;
        });

        console.log('[Wolfie Brightspace] Filtered to', courses.length, 'courses for semester:', semester);
        console.log('[Wolfie Brightspace] Parsed courses from API:', courses.length);
      } else if (enrollmentsData?.Items && Array.isArray(enrollmentsData.Items)) {
        // Alternative format
        courses = enrollmentsData.Items.map((item: any, index: number) => ({
          id: item.OrgUnit?.Id?.toString() || `course_${index}`,
          code: item.OrgUnit?.Code || extractCourseCode(item.OrgUnit?.Name || ''),
          name: item.OrgUnit?.Name || '',
          url: item.Access?.Url || '',
          semester: item.OrgUnit?.Semester?.Name,
          assignments: [],
          resources: []
        }));
        console.log('[Wolfie Brightspace] Fetched courses from Items array:', courses.length);
      } else if (Array.isArray(enrollmentsData)) {
        // Maybe it's just an array directly
        console.log('[Wolfie Brightspace] API returned array directly, trying to parse...');
        courses = enrollmentsData.map((item: any, index: number) => ({
          id: item.OrgUnitId?.toString() || item.Id?.toString() || `course_${index}`,
          code: item.Code || extractCourseCode(item.Name || ''),
          name: item.Name || '',
          url: `/d2l/home/${item.OrgUnitId}` || '',
          semester: item.SemesterName,
          assignments: [],
          resources: []
        }));
        console.log('[Wolfie Brightspace] Fetched courses from array:', courses.length);
      } else {
        console.warn('[Wolfie Brightspace] API returned unexpected format. Full response:', JSON.stringify(enrollmentsData).substring(0, 500));
      }
    } else {
      console.warn('[Wolfie Brightspace] No enrollments URL found on widget');
    }
  } else if (courses.length === 0) {
    console.warn('[Wolfie Brightspace] No widget found, cannot fetch from API');
  }

  // Scrape calendar tasks
  const calendarTasks = scrapeCalendarTasks(doc);
  console.log('[Wolfie Brightspace] Found', calendarTasks.length, 'calendar tasks');

  // Assign tasks to their respective courses
  for (const task of calendarTasks) {
    const course = courses.find(c =>
      c.code === task.courseId ||
      c.id === task.courseId ||
      task.courseId.includes(c.code)
    );
    if (course) {
      course.assignments.push(task);
      console.log('[Wolfie Brightspace] Assigned task to course:', task.title, '->', course.code);
    }
  }

  console.log('[Wolfie Brightspace] Scraped data:', { semester, courseCount: courses.length, courses });

  if (courses.length === 0) {
    console.warn('[Wolfie Brightspace] No courses found. Page might still be loading or selectors need updating.');
    return null;
  }

  // Automatically fetch resources for all courses in parallel
  console.log('[Wolfie Brightspace] Auto-fetching resources for', courses.length, 'courses...');
  const resourcePromises = courses.map(async (course) => {
    try {
      console.log('[Wolfie Brightspace] Fetching resources for course:', course.code, '(ID:', course.id, ')');
      const resources = await fetchResourcesFromAPI(course.id);
      course.resources = resources;
      console.log('[Wolfie Brightspace] Fetched', resources.length, 'resources for', course.code);
      return { courseId: course.id, count: resources.length };
    } catch (error) {
      console.warn('[Wolfie Brightspace] Failed to fetch resources for', course.code, ':', error);
      return { courseId: course.id, count: 0 };
    }
  });

  // Wait for all resource fetches to complete
  const resourceResults = await Promise.all(resourcePromises);
  const totalResources = resourceResults.reduce((sum, r) => sum + r.count, 0);
  console.log('[Wolfie Brightspace] Finished auto-fetching resources:', {
    coursesProcessed: resourceResults.length,
    totalResourcesFetched: totalResources,
    breakdown: resourceResults
  });

  return {
    semester,
    courses,
    lastFetched: Date.now()
  };
}
