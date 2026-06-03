import {Route, Routes} from "react-router-dom";

import {Layout} from "./components/Layout";
import {ModuleList} from "./components/ModuleList";
import {AgentRegister} from "./pages/AgentRegister";
import {Hire} from "./pages/Hire";
import {HireResult} from "./pages/HireResult";
import {ToolDetail} from "./pages/ToolDetail";

function App() {
    return (
        <Layout>
            <Routes>
                <Route path="/" element={<ModuleList />} />
                <Route path="/agent" element={<AgentRegister />} />
                <Route path="/tool/:id" element={<ToolDetail />} />
                <Route path="/hire" element={<Hire />} />
                <Route path="/hire/result/:tx" element={<HireResult />} />
            </Routes>
        </Layout>
    );
}

export default App;
