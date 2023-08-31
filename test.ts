import ini from "ini";

let a = ini.parse(`
[clientProxy.proxy.ucc_stp_client_proxy]
    endPoint[]=ucc_stp_client_ep
    endPoint[]=ucc_stp_intregration_ep
    localEntry[]=ucc_stp_client_le
    operation[]=SaveCliente - Objecto para o registro de cliente e os respetivos dados correspondentes (documento, contacto, agregração, iva, morada, email, site, etc..);
    operation[]=UpdateCliente - Objecto para a atualização dos dados cliente e as respetivas informações correspondentes, com a excessão da morada (documento, contacto, agregração, iva, email, site, etc..);
    operation[]=validateDoc - Validação de todos os tipos de documentos (NIF, BI, etc...), que não podem ser duplicados na base de dados.
    operation[]=validateOtherFilds - Validação de alguns campos obrigatórios e únicos.

[clientProxy.dss.ucc_cliente_dataservice]
    datasource=tplus_datasource
    query[]=ucc_cliente_dataservice/validate_client_doc_query
    query[]=ucc_cliente_dataservice/validate_client_other_fields_query
    query[]=ucc_cliente_dataservice/save_cliente_morada_query
    query[]=ucc_cliente_dataservice/update_object_detail_query
    query[]=ucc_cliente_dataservice/update_insert_objectdetail_0004_query
    query[]=ucc_cliente_dataservice/update_insert_objectdetail_0003_query
    query[]=ucc_cliente_dataservice/update_insert_save_objectdetail_0002_query
    query[]=ucc_cliente_dataservice/update_insert_save_objectdetail_0014_query
    query[]=ucc_cliente_dataservice/update_insert_objectdetail_0010_query
    query[]=ucc_cliente_dataservice/update_ucc_t_object_query
    query[]=ucc_cliente_dataservice/update_ucc_t_object_context_search_query
    query[]=ucc_cliente_dataservice/insert_objectdetail_0005_query
    query[]=ucc_cliente_dataservice/update_insert_objectdetail_0008_query
    query[]=ucc_cliente_dataservice/insert_obj_type_obj_relation_query
    operation[]=ucc_cliente_dataservice/validate_client_doc_operation->validate_client_doc_query
    operation[]=ucc_cliente_dataservice/validate_client_other_fields_operation->validate_client_other_fields_query
    operation[]=ucc_cliente_dataservice/save_cliente_morada_operation->save_cliente_morada_query
    operation[]=ucc_cliente_dataservice/update_object_detail_operation->update_object_detail_query
    operation[]=ucc_cliente_dataservice/update_insert_objectdetail_0004_operation->update_insert_objectdetail_0004_query
    operation[]=ucc_cliente_dataservice/update_insert_objectdetail_0003_query->update_insert_objectdetail_0003_query
    operation[]=ucc_cliente_dataservice/update_insert_save_objectdetail_0002_operation->update_insert_save_objectdetail_0002_query
    operation[]=ucc_cliente_dataservice/update_insert_save_objectdetail_0014_operation->update_insert_save_objectdetail_0014_query
    operation[]=ucc_cliente_dataservice/update_insert_objectdetail_0010_operation->update_insert_objectdetail_0010_query
    operation[]=ucc_cliente_dataservice/update_ucc_t_object_operation->update_ucc_t_object_query
    operation[]=ucc_cliente_dataservice/update_ucc_t_object_context_search_operation->update_ucc_t_object_context_search_query
    operation[]=ucc_cliente_dataservice/insert_objectdetail_0005_operation->insert_objectdetail_0005_query
    operation[]=ucc_cliente_dataservice/update_insert_objectdetail_0008_operation->update_insert_objectdetail_0008_query
    operation[]=ucc_cliente_dataservice/insert_obj_type_obj_relation_operation->insert_obj_type_obj_relation_query

[clientProxy.dss.UCC_T_OBJECT_MASTER_DETAIL_DataService]
    query[]=UCC_T_OBJECT_MASTER_DETAIL_DataService/UCC_T_OBJECT_DETAIL_DETALHES_CLIENTES

[clientProxy.dss.MANAGEMENT_VENDA]
    query[]=MANAGEMENT_VENDA/get_all_loja_query
    operation[]=MANAGEMENT_VENDA/get_all_loja_operation->get_all_loja_query

[clientProxy.sql]
    file[]=scripts/client_proxy.View_Geografia_Ilha_Concelho_20220812.sql
    file[]=scripts/client_proxy.View_UCC_T_OBJECT_DETAIL_DETALHES_CLIENTES_USER.sql
    file[]=scripts/client_proxy.View_UCC_T_OBJECR_DETAIL_DETALHES_CLIENTES.sql
    file[]=scripts/limpeza.contrato-client.sql
    file[]=scripts/limpeza.ent_bank.sql
    file[]=scripts/limpeza.lojas.sql
    file[]=scripts/limpeza.UCC_T_GEOGRAFIA20220812.sql
    file[]=scripts/limpeza.UCC_T_GEOGRAFIA_DESC_20220812.sql

[clientProxy.observacao]
    text[]=EndPoints chamados pelo proxy que não tenho a certeza de foi modificado
    text[]=TypeDetail_EP/select_with_Code_UCC_T_TYPE_DETAIL_operation
    text[12]=_OBJECT_DETAIL_EP/insert_UCC_T_OBJECT_DETAIL_operation

`);

console.log( a.clientProxy);