const { useState } = React;

function App() {
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ image:"", name:"", cpf:"", birth:"", mother:"", address:"", description:"" });

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (files && files[0]) {
      const r = new FileReader();
      r.onload = () => setForm(prev => ({...prev, [name]:r.result}));
      r.readAsDataURL(files[0]);
    } else setForm(prev => ({...prev, [name]:value}));
  };

  const addItem = () => {
    setItems(prev => [...prev, {...form}]);
    setShowForm(false);
  };

  return React.createElement("div", {style:{padding:"10px"}},
    React.createElement("h1", null, "ZEBROL"),

    React.createElement("div",{className:"grid"},
      items.map((i,idx)=>
        React.createElement("div",{key:idx,className:"card",onClick:()=>setSelected(i)},
          i.image ?
            React.createElement("img",{src:i.image,className:"thumb"}) :
            React.createElement("div",{className:"thumb placeholder"},"Sem foto"),
          React.createElement("p",null,i.name || "Sem nome")
        )
      )
    ),

    React.createElement("button",{className:"float-btn",onClick:()=>setShowForm(true)},"+"),

    showForm && React.createElement("div",{className:"modal"},
      React.createElement("div",{className:"modal-box"},
        React.createElement("h2",null,"Cadastrar Novo"),
        React.createElement("input",{type:"file",name:"image",onChange:handleChange}),
        React.createElement("input",{type:"text",name:"name",placeholder:"Nome",onChange:handleChange}),
        React.createElement("input",{type:"text",name:"cpf",placeholder:"CPF",onChange:handleChange}),
        React.createElement("input",{type:"date",name:"birth",onChange:handleChange}),
        React.createElement("input",{type:"text",name:"mother",placeholder:"Mãe",onChange:handleChange}),
        React.createElement("input",{type:"text",name:"address",placeholder:"Endereço",onChange:handleChange}),
        React.createElement("textarea",{name:"description",placeholder:"Descrição",onChange:handleChange}),
        React.createElement("button",{onClick:addItem},"Salvar"),
        React.createElement("button",{onClick:()=>setShowForm(false)},"Cancelar")
      )
    ),

    selected && React.createElement("div",{className:"modal"},
      React.createElement("div",{className:"modal-box"},
        React.createElement("button",{onClick:()=>setSelected(null)},"Fechar"),
        selected.image && React.createElement("img",{src:selected.image,className:"full-img"}),
        React.createElement("p",null,"Nome: ",selected.name),
        React.createElement("p",null,"CPF: ",selected.cpf),
        React.createElement("p",null,"Nascimento: ",selected.birth),
        React.createElement("p",null,"Mãe: ",selected.mother),
        React.createElement("p",null,"Endereço: ",selected.address),
        React.createElement("p",null,"Descrição: ",selected.description)
      )
    )
  );
}

ReactDOM.render(React.createElement(App), document.getElementById("root"));
