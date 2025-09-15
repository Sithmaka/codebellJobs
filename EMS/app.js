// Shared app helpers (imported by all pages)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, doc, query, where, orderBy, updateDoc, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebaseConfig.js";

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Collections
export const C = {
  employees: collection(db, "employees"),
  projects: collection(db, "projects"),
  allocations: collection(db, "allocations"),
  messages: collection(db, "messages"),
  tasks: collection(db, "tasks")
};

// Utilities
export const fmt = {
  date: (d) => d ? new Date(d).toLocaleDateString() : "",
  money: (n) => `LKR ${Number(n||0).toLocaleString()}`
};

export async function seedIfEmpty() {
  const snap = await getDocs(C.employees);
  if (!snap.empty) return;
  const skills = [["Software Development","Cloud"],["Design","UX"],["Data Analysis","ML"],["QA","Automation"]];
  const names = ["Sophia Carter","Ethan Bennett","Olivia Hayes","Liam Foster","Ava Coleman","Noah Brooks","Isabella Reed","Jackson Hayes"];
  for (let i=0;i<names.length;i++){
    await addDoc(C.employees, {
      name: names[i],
      email: names[i].toLowerCase().replace(/\s+/g,'.')+"@codebell.space",
      phone: "+94 7"+(Math.floor(Math.random()*90000000)+10000000),
      department: ["Engineering","Product","Design","Marketing"][i%4],
      role: ["Software Engineer","Product Manager","UX Designer","Marketing Specialist"][i%4],
      status: "Active",
      skills: skills[i%skills.length],
      joined: "2023-0"+((i%8)+1)+"-15",
      avatar: "https://ui-avatars.com/api/?background=0D8ABC&color=fff&name="+encodeURIComponent(names[i])
    });
  }
  const p1 = await addDoc(C.projects, { name:"Project Phoenix", client:"Acme Co", startDate:"2024-01-15", endDate:"2024-06-30", budget:500000, status:"In Progress" });
  const p2 = await addDoc(C.projects, { name:"Project Nova", client:"Globex", startDate:"2024-03-01", endDate:"2024-09-15", budget:350000, status:"Planned" });
  // simple allocations
  const emps = await getDocs(C.employees);
  let i=0;
  for (const e of emps.docs) {
    await addDoc(C.allocations, { employeeId: e.id, projectId: (i%2? p1.id:p2.id), role: e.data().role, assignedOn: new Date().toISOString() });
    i++;
  }
}

// Simple router active state
export function setActive(navId){
  document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('active'));
  const el = document.querySelector(`#${navId}`);
  if (el) el.classList.add('active');
}

// Lightweight query helpers
export async function getById(col, id){
  const ref = doc(db, col, id);
  const d = await getDoc(ref);
  return { id: d.id, ...d.data() };
}

export async function list(col, constraints = []){
  const q = query(collection(db, col), ...constraints);
  const s = await getDocs(q);
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function remove(col, id){
  await deleteDoc(doc(db, col, id));
}
