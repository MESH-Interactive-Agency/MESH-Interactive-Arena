using UnityEngine;

public class saber : MonoBehaviour
{
    public GameObject controller;

    public Slicer slicer;

    public LayerMask layer;
    private Vector3 _previousPos;

    private void OnTriggerEnter(Collider collision)
    {
        Debug.Log("etf");
        if (collision.gameObject.layer == layer) ;
        {
            slicer.isTouched = true;
            FindObjectOfType<Scoreboard>().IncreaseHits();
            Destroy(collision.GetComponent<BoxCollider>());
        }
        _previousPos = transform.position;
    }
}
