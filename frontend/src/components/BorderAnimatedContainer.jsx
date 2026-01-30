// How to make animated gradient border 👇
// https://cruip-tutorials.vercel.app/animated-gradient-border/
function BorderAnimatedContainer({ children }) {
  return (
    <div className="w-full h-full app-border-frame flex overflow-hidden">
      {children}
    </div>
  );
}
export default BorderAnimatedContainer;
