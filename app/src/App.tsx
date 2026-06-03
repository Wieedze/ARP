import {Route, Routes} from "react-router-dom";

import {Layout} from "./components/Layout";
import {ModuleList} from "./components/ModuleList";
import {AgentRegister} from "./pages/AgentRegister";

function App() {
    return (
        <Layout>
            <Routes>
                <Route path="/" element={<ModuleList />} />
                <Route path="/agent" element={<AgentRegister />} />
            </Routes>
        </Layout>
    );
}

export default App;
